from flask import Flask, redirect, request, render_template, session, jsonify, url_for, Response, stream_with_context, abort, send_file
from datetime import datetime, timedelta
from dateutil import tz
import pytz
import redis
import requests
import json
import configparser
import time
from collections import deque
import re
from urllib.parse import quote_plus
import hashlib
from pathlib import Path
import os

##
# Setup
##

config = configparser.ConfigParser()
config.read('config.ini')

tz = pytz.timezone('US/Eastern')

app = Flask(__name__)

# Replace with your own client ID and secret
CLIENT_ID = config['oauth']['client_id']
CLIENT_SECRET = config['oauth']['client_secret']

app.secret_key = config['default']['secret_key']

# Connect to Redis
r = redis.Redis(host='localhost', port=6379, decode_responses=True)

# A global queue to store SSE messages
message_queue = deque()

##
# Local File Cache for Images
##

CACHE_DIR = Path("cache/images")
CACHE_DIR.mkdir(parents=True, exist_ok=True)  # Ensure cache/images folder exists
CACHE_TTL = 3600  # 1 hour time-to-live for cached images

def get_local_image(image_url: str) -> str:
    """
    Checks if a locally cached copy of the image exists and is still valid.
    If missing or older than CACHE_TTL, downloads from `image_url` and saves locally.
    Returns the file path for the local image.
    """
    # Use an md5 hash of the URL for a unique filename (force .png or parse extension as needed)
    image_key = hashlib.md5(image_url.encode("utf-8")).hexdigest()
    local_path = CACHE_DIR / f"{image_key}.png"

    # Check if file is fresh
    if local_path.exists():
        mtime = local_path.stat().st_mtime
        if (time.time() - mtime) < CACHE_TTL:
            return str(local_path)

    # If missing or stale, re-download
    resp = requests.get(image_url, timeout=10)
    resp.raise_for_status()

    with open(local_path, "wb") as f:
        f.write(resp.content)

    return str(local_path)

@app.route("/cached-image")
def cached_image():
    """
    Serve a locally cached version of an image, re-downloading if needed.
    Expects ?url=<URL> as a query parameter.
    """
    image_url = request.args.get("url")
    if not image_url:
        abort(400, "Missing 'url' parameter")

    try:
        local_path = get_local_image(image_url)
        return send_file(local_path, mimetype="image/png")
    except requests.exceptions.RequestException as e:
        abort(500, f"Image download failed: {str(e)}")

##
# SSE / Utility
##

def send_sse_message(message):
    """Add a message to the global queue to be sent to the client via SSE."""
    message_queue.append(message)

def contains_digit(s):
    return any(char.isdigit() for char in s)

@app.route('/updates')
def updates():
    def event_stream():
        while True:
            while message_queue:
                msg = message_queue.popleft()
                yield f"data: {msg}\n\n"
            time.sleep(1)  # Prevent tight loop
    return Response(stream_with_context(event_stream()), mimetype="text/event-stream")

##
# Routes
##

@app.route('/')
def index():
    return render_template('index.html', navbar=False, loader=False)

@app.route('/login')
def login():
    print('/login')
    return redirect(
        'https://oauth.battle.net/authorize?client_id={}&redirect_uri={}&response_type=code&scope=wow.profile'.format(
            CLIENT_ID, 'http://localhost:8000/callback'
        )
    )

@app.route('/callback')
def callback():
    print('/callback')
    if 'battlenet_token' not in session:
        print('no token')
        code = request.args.get('code')
        access_token = set_token(code)
    return redirect(url_for('alts'))

@app.route('/alts')
def alts():
    return render_template("alts.html", navbar=True, loader=True)

@app.route('/alt_detail')
def alt_detail():
    name = request.args.get('name')
    realm = request.args.get('realm')
    return render_template("alt-detail.html", modal=True)

@app.route('/reps')
def reps():
    return render_template("reps.html", navbar=True, loader=True)

##
# get_alts
##

@app.route('/get_alts', methods=['POST'])
def get_alts():
    print('Starting /get_alts')
    if request.method == 'POST':
        # Check user info
        send_sse_message('Getting user info')
        user_info = blizzard_api_request('https://oauth.battle.net/userinfo')
        if isinstance(user_info, dict) and 'battletag' in user_info:
            battletag = user_info['battletag']
        else:
            # If user_info is a redirect, just return it; or handle the fallback
            return user_info

        print('/get_alts: character data')
        send_sse_message('Building list of characters')
        start = time.time()

        # Retrieve character data via our new helper
        character_data = blizzard_api_request('https://us.api.blizzard.com/profile/user/wow?namespace=profile-us&locale=en_US')
        if not isinstance(character_data, dict):
            # Possibly a redirect
            return character_data

        end = time.time()
        elapsed = end - start
        print('/get_alts: character data returned')
        print(f'{elapsed} s seconds')

        number_alts = 0
        total_money = 0
        alts = []

        print('/get_alts: loop start')
        send_sse_message('Getting alt info')

        start = time.time()

        for account in character_data.get('wow_accounts', []):
            number_alts += len(account['characters'])
            for character in account['characters']:
                alt = {
                    'account_id': account['id'],
                    'name': character['name'],
                    'character_id': character['id'],
                    'level': character['level'],
                    'realm': character['realm']['name'],
                    'realm_slug': character['realm']['slug'],
                    'realm_id': character['realm']['id'],
                    'class': character['playable_class']['name'],
                    'race': character['playable_race']['name'],
                    'gender': character['gender']['name'],
                    'faction': character['faction']['name'],
                    'achievement_points': 0,
                    'average_item_level': 0,
                    'last_login': '',
                    'professions': '',
                    'gold': '0',
                    'silver': '0',
                    'copper': '0',
                    'location': ''
                }

                # Filter out low-level + digit-named
                if alt['level'] > 20 and not contains_digit(alt['name']):
                    send_sse_message('Processing: ' + alt['name'])

                    # Character media
                    media_url = f"https://us.api.blizzard.com/profile/wow/character/{alt['realm_slug']}/{alt['name'].lower()}/character-media?namespace=profile-us&locale=en_US"
                    media = blizzard_api_request(media_url)
                    if isinstance(media, dict):
                        for asset in media.get('assets', []):
                            cached_url = f"/cached-image?url={quote_plus(asset['value'])}"
                            if asset['key'] == 'avatar':
                                alt['avatar_image'] = cached_url
                            if asset['key'] == 'inset':
                                alt['inset_image'] = cached_url
                            if asset['key'] == 'main-raw':
                                alt['main_image'] = cached_url

                    # Character profile summary
                    char_profile_url = f"https://us.api.blizzard.com/profile/wow/character/{alt['realm_slug']}/{alt['name'].lower()}?namespace=profile-us&locale=en_US"
                    data = blizzard_api_request(char_profile_url)
                    if isinstance(data, dict):
                        alt['achievement_points'] = data.get('achievement_points', 0)
                        alt['average_item_level'] = data.get('average_item_level', 0)
                        timestamp = data.get('last_login_timestamp', 0) / 1000
                        alt['last_login'] = convert_timestamp(timestamp)
                        if 'active_spec' in data:
                            alt['spec'] = data['active_spec']['name']

                    # Professions
                    prof_url = f"https://us.api.blizzard.com/profile/wow/character/{alt['realm_slug']}/{alt['name'].lower()}/professions?namespace=profile-us&locale=en_US"
                    professions_data = blizzard_api_request(prof_url)
                    if isinstance(professions_data, dict) and 'primaries' in professions_data:
                        prof_list = []
                        for prof in professions_data['primaries']:
                            prof_dict = {
                                'name': prof['profession']['name'],
                                'tier': prof['tiers'][-1]['tier']['name'],
                                'skill_points': prof['tiers'][-1]['skill_points'],
                                'max_skill_points': prof['tiers'][-1]['max_skill_points']
                            }
                            prof_list.append(prof_dict)
                        alt['professions'] = prof_list

                    # Protected character info (money, location)
                    prot_char_url = f"https://us.api.blizzard.com/profile/user/wow/protected-character/{alt['realm_id']}-{alt['character_id']}?namespace=profile-us&locale=en_US"
                    data = blizzard_api_request(prot_char_url)
                    if isinstance(data, dict) and 'money' in data:
                        total_money += data['money']
                        alt['gold'], alt['silver'], alt['copper'] = convert_money(str(data['money']))
                        alt['location'] = data['position']['zone']['name']

                alts.append(alt)

        end = time.time()
        elapsed = end - start
        print('/get_alts: loop ended')
        send_sse_message('/get_alts: loop ended')
        print(f'{elapsed} s seconds')

        alts.sort(key=lambda x: (x['account_id'], x['level'], x['name']))
        summary = {
            'accounts': len(character_data.get('wow_accounts', [])),
            'number_alts': number_alts,
            'battletag': battletag
        }
        summary['gold'], summary['silver'], summary['copper'] = convert_money(str(total_money))
        return [alts, summary]

##
# get_reps
##

@app.route('/get_reps', methods=['POST'])
def get_reps():
    if request.method == 'POST':
        expansion_id = request.json.get('expansion_id', 2569)

        send_sse_message('Getting factions for xpac')
        xpac_url = f"https://us.api.blizzard.com/data/wow/reputation-faction/{expansion_id}?namespace=static-us&locale=en_US"
        xpac_factions = blizzard_api_request(xpac_url)
        if not isinstance(xpac_factions, dict) or 'name' not in xpac_factions:
            return xpac_factions  # Possibly a redirect

        xpac_name = xpac_factions['name']
        send_sse_message('Getting factions for ' + xpac_name)
        factions_by_id = {f["id"]: f for f in xpac_factions.get("factions", [])}

        # Enrich faction data
        for faction_id, faction_data in factions_by_id.items():
            faction_details = blizzard_api_request(
                f"https://us.api.blizzard.com/data/wow/reputation-faction/{faction_id}?namespace=static-us&locale=en_US"
            )
            if isinstance(faction_details, dict):
                if "renown_tiers" in faction_details:
                    faction_data["renown_tiers"] = faction_details["renown_tiers"]
                    faction_data["max_renown_level"] = len(faction_details["renown_tiers"])
                else:
                    faction_data["max_renown_level"] = None
                faction_data["description"] = faction_details.get("description", "")
                faction_data["can_paragon"] = faction_details.get("can_paragon", False)
                faction_data["is_renown"] = faction_details.get("is_renown", False)

        send_sse_message('Getting user info')
        user_info = blizzard_api_request("https://oauth.battle.net/userinfo")
        if not isinstance(user_info, dict) or 'battletag' not in user_info:
            return user_info
        battletag = user_info['battletag']

        character_data = blizzard_api_request(
            "https://us.api.blizzard.com/profile/user/wow?namespace=profile-us&locale=en_US"
        )
        if not isinstance(character_data, dict):
            return character_data

        alts = []

        for account in character_data.get('wow_accounts', []):
            for character in account['characters']:
                if character['level'] > 60 and not contains_digit(character['name']):
                    alt = {
                        'account_id': account['id'],
                        'name': character['name'],
                        'character_id': character['id'],
                        'level': character['level'],
                        'realm': character['realm']['name'],
                        'realm_slug': character['realm']['slug'],
                        'realm_id': character['realm']['id'],
                        'class': character['playable_class']['name'],
                        'faction': character['faction']['name'],
                    }

                    # Get reps
                    send_sse_message('Getting rep data for ' + character['name'])
                    reps_data = blizzard_api_request(
                        f"https://us.api.blizzard.com/profile/wow/character/{alt['realm_slug']}/{alt['name'].lower()}/reputations?namespace=profile-us&locale=en_US"
                    )
                    reps = []
                    if isinstance(reps_data, dict) and 'reputations' in reps_data:
                        for item in reps_data['reputations']:
                            if item['faction']['id'] in factions_by_id:
                                faction_data = factions_by_id[item['faction']['id']]
                                standing = item['standing']
                                rep = {
                                    'faction_name': item['faction']['name'],
                                    'faction_id': item['faction']['id'],
                                    'raw': standing['raw'],
                                    'value': standing['value'],
                                    'max': standing['max'],
                                    'tier': standing.get('tier', ''),
                                    'renown_level': standing.get('renown_level', ''),
                                    'standing_name': standing['name'],
                                    'is_renown': faction_data.get('is_renown', False),
                                    'max_renown_level': faction_data.get('max_renown_level', None),
                                    'can_paragon': faction_data.get('can_paragon', False),
                                    'description': faction_data.get('description', ''),
                                    'renown_tiers': faction_data.get('renown_tiers', [])
                                }
                                reps.append(rep)
                    alt['reps'] = reps

                    # Get media
                    send_sse_message('Getting media data for ' + character['name'])
                    media_url = f"https://us.api.blizzard.com/profile/wow/character/{alt['realm_slug']}/{alt['name'].lower()}/character-media?namespace=profile-us&locale=en_US"
                    media = blizzard_api_request(media_url)
                    if isinstance(media, dict):
                        for asset in media.get('assets', []):
                            cached_url = f"/cached-image?url={quote_plus(asset['value'])}"
                            if asset['key'] == 'avatar':
                                alt['avatar_image'] = cached_url
                            if asset['key'] == 'inset':
                                alt['inset_image'] = cached_url
                            if asset['key'] == 'main-raw':
                                alt['main_image'] = cached_url

                    # Additional character info
                    profile_url = f"https://us.api.blizzard.com/profile/wow/character/{alt['realm_slug']}/{alt['name'].lower()}?namespace=profile-us&locale=en_US"
                    profile_summary = blizzard_api_request(profile_url)
                    if isinstance(profile_summary, dict):
                        timestamp = profile_summary.get('last_login_timestamp', 0) / 1000
                        alt['last_login'] = convert_timestamp(timestamp)

                    alts.append(alt)

        alts.sort(key=lambda x: (x['account_id'], x['level'], x['name']))
        return jsonify(alts)

##
# alt detail
##

@app.route('/get_alt_detail', methods=['POST'])
def get_alt_detail():
    if request.method == 'POST':
        altName = request.json.get('name', '')
        altRealm = request.json.get('realm', '')

        # Character profile summary
        char_url = f"https://us.api.blizzard.com/profile/wow/character/{altRealm.lower()}/{altName.lower()}?namespace=profile-us&locale=en_US"
        alt = blizzard_api_request(char_url)
        if isinstance(alt, dict):
            faction = alt['faction']['name']
            guild = alt['guild']['name'] if 'guild' in alt else ''
            average_item_level = alt['average_item_level']
            level = alt['level']
            race = alt['race']['name']
            spec = alt['active_spec']['name'] if 'active_spec' in alt else ''
            altClass = alt['character_class']['name']

            achievement_points = alt['achievement_points']
            timestamp = alt['last_login_timestamp'] / 1000
            last_login = convert_timestamp(timestamp)

            # Get media
            send_sse_message('Getting media data for ' + altName)
            media_url = f"https://us.api.blizzard.com/profile/wow/character/{altRealm.lower()}/{altName.lower()}/character-media?namespace=profile-us&locale=en_US"
            media = blizzard_api_request(media_url)
            main_image = ""
            if isinstance(media, dict):
                for asset in media.get('assets', []):
                    cached_url = f"/cached-image?url={quote_plus(asset['value'])}"
                    if asset['key'] == 'main-raw':
                        main_image = cached_url

            detail = f"""
                <article class='alt-detail {altClass.lower().replace(" ", "")}'>
                    <header class='{faction.lower()}'>
                        <h1>{altName}</h1>
                        <h2>{guild}</h2>
                        <h3><span class='{altClass.lower().replace(" ", "")}'>{average_item_level}</span> ilvl</h3>
                        <h4>{level} {race} <span class='{altClass.lower().replace(" ", "")}'>{spec}</span> {altClass}</h4>
                    </header>
                    <div class='container'>
                        <img src='{main_image}' class='image-skew' />
                    </div>
                </article>
                <div id='modal-particles'></div>
            """
            return jsonify({'html': detail})
        else:
            return alt  # Possibly a redirect if token expired, etc.

##
# Helper Functions
##

def convert_timestamp(timestamp):
    dt = datetime.fromtimestamp(timestamp, pytz.timezone('UTC'))
    central = dt.astimezone(pytz.timezone('America/Chicago'))
    return central.strftime('%Y-%m-%dT%H:%M:%S')

def convert_money(money):
    copper = money[-2:]
    silver = money[-4:-2]
    gold = money[:-4]
    return gold, silver, copper

def get_professions(url, headers):
    # This is now replaced by direct calls to blizzard_api_request, but
    # if you need extra parsing logic, keep it. Otherwise, you can remove or simplify.
    alt_professions = []
    data = blizzard_api_request(url, headers)
    if isinstance(data, dict) and 'primaries' in data:
        for primary in data['primaries']:
            prof = {
                'name': primary['profession']['name'],
                'id': primary['profession']['id'],
                'tier_name': primary['tiers'][-1]['tier']['name'],
                'skill_points': primary['tiers'][-1]['skill_points'],
                'max_skill_points': primary['tiers'][-1]['max_skill_points']
            }
            alt_professions.append(prof)
    return alt_professions

def get_faction_details(faction_id, headers):
    # Similarly replaced by direct calls to blizzard_api_request if needed
    url = f"https://us.api.blizzard.com/data/wow/reputation-faction/{faction_id}?namespace=static-us&locale=en_US"
    return blizzard_api_request(url, headers)

def blizzard_api_request(url, headers=None):
    """Unified helper to handle Blizzard API calls with token checking and Redis caching."""
    # 1. Check if there's a valid token in the session
    token = get_valid_token()
    if not token:
        return redirect(url_for('login'))

    # 2. See if the requested URL is in Redis
    cached_response = r.get(url)  # using 'url' as cache key
    if cached_response:
        if not isinstance(cached_response, str):
            return json.loads(cached_response.decode('utf-8'))
        else:
            return json.loads(cached_response)

    # 3. If not cached, make a live request
    all_headers = headers or {}
    all_headers['Authorization'] = f'Bearer {token}'

    resp = requests.get(url, headers=all_headers)

    # 4. If token is invalid/expired => 401 => clear session, redirect to /login
    if resp.status_code == 401:
        session.clear()
        return redirect(url_for('login'))

    # 5. If 404, just return None or handle as you wish
    if resp.status_code == 404:
        return None

    resp.raise_for_status()

    # 6. Store the fresh response in Redis
    #    - If URL has 'profile', we set a 12-hour TTL
    #    - Otherwise, indefinite or your preferred TTL
    if 'profile' in url:
        r.set(url, resp.text, ex=43200)  # 12 hours = 43200 seconds
    else:
        r.set(url, resp.text)

    # 7. Return JSON response
    return resp.json()

def is_token_expired():
    if 'token_expires_at' not in session:
        return True
    return time.time() >= session['token_expires_at']

def get_valid_token():
    # Return None if token is missing or expired
    if 'access_token' not in session or is_token_expired():
        return None
    return session['access_token']

def set_token(code):
    data = {
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'code': code,
        'redirect_uri': 'http://localhost:8000/callback',
        'grant_type': 'authorization_code'
    }
    try:
        response = requests.post('https://oauth.battle.net/token', data=data)
        response.raise_for_status()
    except requests.exceptions.HTTPError as err:
        raise SystemExit(err)

    response_json = json.loads(response.text)
    print(response_json)
    access_token = response_json['access_token']
    expires_in = response_json.get('expires_in', 86400)  # default 24h

    app.permanent_session_lifetime = expires_in
    session.permanent = True
    session['access_token'] = access_token
    session['token_expires_at'] = time.time() + expires_in

    return access_token

def ceil_dt(dt, delta):
    return dt + (datetime.min - dt) % delta

##
# Run
##

if __name__ == '__main__':
    app.run(host="localhost", port=8000, debug=True)