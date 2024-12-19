from flask import Flask, redirect, request, render_template, session, jsonify, url_for, Response, stream_with_context
from datetime import datetime, timedelta
from dateutil import tz
import pytz
import redis
import requests
import json
import configparser
import gamedata
import time
from collections import deque
import re

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


# A global queue to store messages. We'll pop messages off this queue in the SSE endpoint.
message_queue = deque()

def send_sse_message(message):
    """Add a message to the global queue to be sent to the client via SSE."""
    message_queue.append(message)

def contains_digit(s):
    return any(char.isdigit() for char in s)

@app.route('/updates')
def updates():
    def event_stream():
        # Continuously yield any messages in the queue
        while True:
            # If there are messages in the queue, yield them as SSE
            while message_queue:
                msg = message_queue.popleft()
                yield f"data: {msg}\n\n"
            time.sleep(1)  # Prevent tight loop - adjust as needed
    return Response(stream_with_context(event_stream()), mimetype="text/event-stream")

@app.route('/')
def index():
    return render_template('index.html', navbar=False)

@app.route('/login')
def login():
    # Redirect the user to the Battle.net OAuth authorize endpoint
    print('/login')
    return redirect('https://oauth.battle.net/authorize?client_id={}&redirect_uri={}&response_type=code&scope=wow.profile'.format(CLIENT_ID, 'http://localhost:8000/callback'))

@app.route('/callback')
def callback():
    print('/callback')
    if 'battlenet_token' not in session:
        print('no token')
        # Get the authorization code from the query string
        code = request.args.get('code')
        access_token = set_token(code)
    return redirect(url_for('alts'))

@app.route('/alts')
def alts():
    return render_template("alts.html", navbar=True)

@app.route('/mounts')
def mounts():
    return render_template("mounts.html", navbar=True)

@app.route('/reps')
def reps():
    return render_template("reps.html", navbar=True)

@app.route('/info')
def info():
    return render_template("info.html", navbar=True)


@app.route('/get_alts', methods=['POST'])
def get_alts():
    print('Starting /get_alts')
    if request.method == 'POST':
        # Use the access token to make an authenticated API request
        access_token = session.get('battlenet_token')
        headers = {'Authorization': 'Bearer {}'.format(access_token)}

        send_sse_message('Getting user info')
        user_info = get_response('https://oauth.battle.net/userinfo', headers)
        battletag = user_info['battletag']

        print('/get_alts: character data')
        send_sse_message('Building list of characters')
        start = time.time()
        character_data = get_response('https://us.api.blizzard.com/profile/user/wow?namespace=profile-us&locale=en_US', headers)
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

        for account in character_data['wow_accounts']:
            number_alts += len(account['characters'])
            for character in account['characters']:
                
                alt = {}
                alt['account_id'] = account['id']
                alt['name'] = character['name']
                alt['character_id'] = character['id']
                alt['level'] = character['level']
                alt['realm'] = character['realm']['name']
                alt['realm_slug'] = character['realm']['slug']
                alt['realm_id'] = character['realm']['id']
                alt['class'] = character['playable_class']['name']
                alt['race'] = character['playable_race']['name']
                alt['gender'] = character['gender']['name']
                alt['faction'] = character['faction']['name']

                alt['achievement_points'] = 0
                alt['average_item_level'] = 0
                alt['last_login'] = ''
                alt['professions'] = ''
                alt['gold'] = alt['silver'] = alt['copper'] = '0'
                alt['location'] = ''

                if alt['level'] >20 and not contains_digit(alt['name']):
                    send_sse_message('Processing: ' + alt['name'] )


                    media = get_response('https://us.api.blizzard.com/profile/wow/character/' + alt['realm_slug'] + '/' + alt['name'].lower() + '/character-media?namespace=profile-us&locale=en_US', headers)
                    if media:
                        for asset in media['assets']:
                            if asset['key'] == 'avatar':
                                alt['avatar_image'] = asset['value']
                            if asset['key'] == 'inset':
                                alt['inset_image'] = asset['value']
                            if asset['key'] == 'main-raw':
                                alt['main_image'] = asset['value']

                    data = get_response('https://us.api.blizzard.com/profile/wow/character/' + alt['realm_slug'] + '/' + alt['name'].lower() + '?namespace=profile-us&locale=en_US', headers)
                    if data:
                        alt['achievement_points'] = data['achievement_points']
                        alt['average_item_level'] = data['average_item_level']
                        timestamp = data['last_login_timestamp']/1000
                        alt['last_login'] = convert_timestamp(timestamp)
                        if 'active_spec' in data:
                            alt['spec'] = data['active_spec']['name']

                    professions = []
                    professions_data = get_professions('https://us.api.blizzard.com/profile/wow/character/' + alt['realm_slug'] + '/' + alt['name'].lower() + '/professions?namespace=profile-us&locale=en_US', headers)
                    if data:
                        for profession in professions_data:
                            alt_profession = {}
                            alt_profession['name'] = profession['name']
                            alt_profession['tier'] = profession['tier_name']
                            alt_profession['skill_points'] = profession['skill_points']
                            alt_profession['max_skill_points'] = profession['max_skill_points']
                            professions.append(alt_profession)
                        alt['professions'] = professions

                    data = get_response('https://us.api.blizzard.com/profile/user/wow/protected-character/' + str(alt['realm_id']) + '-' + str(alt['character_id']) + '?namespace=profile-us&locale=en_US', headers)
                    if data:
                        total_money += data['money']
                        alt['gold'], alt['silver'], alt['copper'] = convert_money(str(data['money']))
                        alt['location'] = data['position']['zone']['name']

                alts.append(alt)
        
        end = time.time()
        elapsed = end - start
        print('/get_alts: loop ended')
        send_sse_message('/get_alts: loop ended')
        print(f'{elapsed} s seconds')

        # print(characters)
        alts.sort(key=lambda x: (x['account_id'], x['level'], x['name']))
        summary = {}
        summary['accounts'] = len(character_data['wow_accounts'])
        summary['number_alts'] = number_alts
        summary['battletag'] = battletag
        summary['gold'], summary['silver'], summary['copper'] = convert_money(str(total_money))
        return [alts, summary]

@app.route('/get_reps', methods=['POST'])
def get_reps():
    if request.method == 'POST':
        # Use the access token to make an authenticated API request
        access_token = session.get('battlenet_token')
        headers = {'Authorization': 'Bearer {}'.format(access_token)}

        # Retrieve expansion ID from POST data, default to "The War Within" (ID: 2569)
        expansion_id = request.json.get('expansion_id', 2569)

        send_sse_message('Getting factions for xpac')

        # Get factions for expansion
        xpac_factions = get_response(f'https://us.api.blizzard.com/data/wow/reputation-faction/' + str(expansion_id) + '?namespace=static-us&locale=en_US', headers)
        # Transform the faction list into a dictionary keyed by faction ID:
        xpac_name = xpac_factions['name']
        send_sse_message('Getting factions for ' + xpac_name)
        factions_by_id = {faction["id"]: faction for faction in xpac_factions["factions"]}

        for faction_id, faction_data in factions_by_id.items():
            faction_details = get_faction_details(faction_id, headers)

            # Merge the detailed data into the faction_data
            if "renown_tiers" in faction_details:
                faction_data["renown_tiers"] = faction_details["renown_tiers"]
                # Determine max rank from the length of renown_tiers
                faction_data["max_renown_level"] = len(faction_details["renown_tiers"])
            else:
                faction_data["max_renown_level"] = None  # or 0, if no renown tiers

            if "description" in faction_details:
                faction_data["description"] = faction_details["description"]
            if "can_paragon" in faction_details:
                faction_data["can_paragon"] = faction_details["can_paragon"]
            if "is_renown" in faction_details:
                faction_data["is_renown"] = faction_details["is_renown"]

        # Get user information
        send_sse_message('Getting user info')

        user_info = get_response(f'https://oauth.battle.net/userinfo?access_token={access_token}', '')
        battletag = user_info['battletag']

        # Fetch account and character data
        character_data = get_response(f'https://us.api.blizzard.com/profile/user/wow?namespace=profile-us&locale=en_US', headers)
        alts = []

        for account in character_data['wow_accounts']:
            for character in account['characters']:
                # Filter out low-level characters and characters with numeric names
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

                    # Fetch reputation data
                    send_sse_message('Getting rep data for ' + character['name'])
                    reps_data = get_response(
                        f'https://us.api.blizzard.com/profile/wow/character/{alt["realm_slug"]}/{alt["name"].lower()}/reputations?namespace=profile-us&locale=en_US',
                        headers,
                    )
                    reps = []

                    for item in reps_data['reputations']:
                        # Only include reputations with a faction ID matching the expansion filter
                        if item['faction']['id'] in factions_by_id:
                            faction_data = factions_by_id[item['faction']['id']]
                            rep = {
                                'faction_name': item['faction']['name'],
                                'faction_id': item['faction']['id'],
                                'raw': item['standing']['raw'],
                                'value': item['standing']['value'],
                                'max': item['standing']['max'],
                                'tier': item['standing'].get('tier', ''),
                                'renown_level': item['standing'].get('renown_level', ''),
                                'standing_name': item['standing']['name'],

                                # Add new variables from factions_by_id:
                                'is_renown': faction_data.get('is_renown', False),
                                'max_renown_level': faction_data.get('max_renown_level', None),
                                'can_paragon': faction_data.get('can_paragon', False),
                                'description': faction_data.get('description', ''),

                                # If you stored renown tiers:
                                'renown_tiers': faction_data.get('renown_tiers', [])
                            }
                            reps.append(rep)

                    alt['reps'] = reps

                    # Fetch character media
                    send_sse_message('Getting media data for ' + character['name'])
                    media = get_response(
                        f'https://us.api.blizzard.com/profile/wow/character/{alt["realm_slug"]}/{alt["name"].lower()}/character-media?namespace=profile-us&locale=en_US',
                        headers,
                    )
                    if media:
                        for asset in media['assets']:
                            if asset['key'] == 'avatar':
                                alt['avatar_image'] = asset['value']
                            if asset['key'] == 'inset':
                                alt['inset_image'] = asset['value']
                            if asset['key'] == 'main-raw':
                                alt['main_image'] = asset['value']

                    # Fetch additional character info
                    profile_summary = get_response(
                        f'https://us.api.blizzard.com/profile/wow/character/{alt["realm_slug"]}/{alt["name"].lower()}?namespace=profile-us&locale=en_US',
                        headers,
                    )
                    timestamp = profile_summary['last_login_timestamp'] / 1000
                    alt['last_login'] = convert_timestamp(timestamp)

                    alts.append(alt)

        # Sort characters by account ID, level, and name
        alts.sort(key=lambda x: (x['account_id'], x['level'], x['name']))
        return jsonify(alts)

def convert_timestamp(timestamp):
    # convert the timestamp to a datetime object
    dt = datetime.fromtimestamp(timestamp, pytz.timezone('UTC'))

    # convert the datetime object to Central time
    central = dt.astimezone(pytz.timezone('America/Chicago'))

    # format the datetime object as a string in the desired format
    result = central.strftime('%Y-%m-%dT%H:%M:%S')

    return result

def convert_money(money):
    # get the last two characters
    copper = money[-2:]

    # get the next two characters
    silver = money[-4:-2]

    # get the remainder
    gold = money[:-4]

    return gold, silver, copper

def get_professions(url, headers):
    alt_professions = []
    data = get_response(url, headers)
    if data:
        if 'primaries' in data:
            for primary in data['primaries']:
                prof = {}
                prof['name'] = primary['profession']['name']
                prof['id'] = primary['profession']['id']
                prof['tier_name'] = primary['tiers'][len(primary['tiers'])-1]['tier']['name']
                prof['skill_points'] = primary['tiers'][len(primary['tiers'])-1]['skill_points']
                prof['max_skill_points'] = primary['tiers'][len(primary['tiers'])-1]['max_skill_points']
                alt_professions.append(prof)
        return alt_professions
    return

def get_faction_details(faction_id, headers):
    url = f"https://us.api.blizzard.com/data/wow/reputation-faction/{faction_id}?namespace=static-us&locale=en_US"
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    return response.json()

def get_response(url, headers):
    # Check if the response is in the cache
    response = r.get(url)
    if response:
        if type(response) != str:
            return json.loads(response.decode('utf-8'))
        else:
            return json.loads(response)

    try:
        if headers != '':
            response = requests.get(url, headers=headers)
        else:
            response = requests.get(url)
        response.raise_for_status()
    except requests.exceptions.HTTPError as err:
        if response.status_code == 404:
            return

        raise SystemExit(err)
    
    if 'profile' in url:
        r.set(url, response.text, ex=43200)
    else:
        r.set(url, response.text)
    return json.loads(response.text)

def set_token(code):
    # Exchange the authorization code for an access token
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
    app.permanent_session_lifetime = response_json['expires_in']

    session.permanent = True
    session['battlenet_token'] = (access_token)
    return access_token

def ceil_dt(dt, delta):
    return dt + (datetime.min - dt) % delta

if __name__ == '__main__':
     app.run(host="localhost", port=8000, debug=True)