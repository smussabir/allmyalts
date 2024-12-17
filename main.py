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
        user_info = get_response('https://oauth.battle.net/userinfo?access_token=' + access_token, '')
        battletag = user_info['battletag']

        print('/get_alts: character data')
        send_sse_message('Building list of characters')
        start = time.time()
        character_data = get_response('https://us.api.blizzard.com/profile/user/wow?namespace=profile-us&locale=en_US&access_token=' + access_token, headers)
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

                send_sse_message('Processing: ' + alt['name'] )

                media = get_response('https://us.api.blizzard.com/profile/wow/character/' + alt['realm_slug'] + '/' + alt['name'].lower() + '/character-media?namespace=profile-us&locale=en_US&access_token=' + access_token, headers)
                if media:
                    for asset in media['assets']:
                        if asset['key'] == 'avatar':
                            alt['avatar_image'] = asset['value']
                        if asset['key'] == 'inset':
                            alt['inset_image'] = asset['value']
                        if asset['key'] == 'main-raw':
                            alt['main_image'] = asset['value']
                        # if asset['key'] == 'main':
                        #     alt['main_image'] = asset['value']

                alt['achievement_points'] = 0
                alt['average_item_level'] = 0
                alt['last_login'] = ''
                data = get_response('https://us.api.blizzard.com/profile/wow/character/' + alt['realm_slug'] + '/' + alt['name'].lower() + '?namespace=profile-us&locale=en_US&access_token=' + access_token, headers)
                if data:
                    alt['achievement_points'] = data['achievement_points']
                    alt['average_item_level'] = data['average_item_level']
                    timestamp = data['last_login_timestamp']/1000
                    alt['last_login'] = convert_timestamp(timestamp)

                alt['professions'] = ''
                professions = []
                professions_data = get_professions('https://us.api.blizzard.com/profile/wow/character/' + alt['realm_slug'] + '/' + alt['name'].lower() + '/professions?namespace=profile-us&locale=en_US&access_token=' + access_token, headers)
                if data:
                    for profession in professions_data:
                        alt_profession = {}
                        alt_profession['name'] = profession['name']
                        alt_profession['tier'] = profession['tier_name']
                        alt_profession['skill_points'] = profession['skill_points']
                        alt_profession['max_skill_points'] = profession['max_skill_points']
                        professions.append(alt_profession)
                    alt['professions'] = professions

                data = get_response('https://us.api.blizzard.com/profile/user/wow/protected-character/' + str(alt['realm_id']) + '-' + str(alt['character_id']) + '?namespace=profile-us&locale=en_US&access_token=' + access_token, headers)
                alt['gold'] = alt['silver'] = alt['copper'] = '0'
                alt['location'] = 'unknown'
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

@app.route('/get_mounts', methods=['POST'])
def get_mounts():
    if request.method == 'POST':
        access_token = session.get('battlenet_token')
        headers = {'Authorization': 'Bearer {}'.format(access_token)}

        mounts_data = get_response('https://us.api.blizzard.com/profile/user/wow/collections/mounts?namespace=profile-us&locale=en_US&access_token=' + access_token, headers)
        mounts = []
        for mount_item in mounts_data['mounts']:
            mount = {}
            mount['name'] = mount_item['mount']['name']
            mount['mount_id'] = mount_item['mount']['id']

            data = get_response('https://us.api.blizzard.com/data/wow/mount/' + str(mount['mount_id']) + '?namespace=static-us&locale=en_US&access_token=' + access_token, headers)
            mount_display = []
            for display in data['creature_displays']:
                creature_display = {}
                creature_display['display_id'] = display['id']
                media = get_response('https://us.api.blizzard.com/data/wow/media/creature-display/' + str(display['id']) + '?namespace=static-us&locale=en_US&access_token=' + access_token, headers)
                creature_display['image'] = media['assets'][0]['value']
                mount_display.append(creature_display)

            mount['mount_display'] = mount_display
            mount['description'] = data['description']
            if 'source' in data:
                mount['source'] = data['source']['name']
            if 'requirements' in data:
                if len(data['requirements']) > 1:
                    if 'classes' in data['requirements']:
                        print(data['requirements']['classes'][0]['name'])
                    if 'faction' in data['requirements']:
                        print(data['requirements']['faction']['name'])
                    if 'races' in data['requirements']:
                        print(data['requirements']['races'][0]['name'])


            mounts.append(mount)
        mounts.sort(key=lambda x: (x['name']))
        summary = {}
        summary['number_mounts'] = len(mounts_data['mounts'])

        return [mounts, summary]

@app.route('/get_reps', methods=['POST'])
def get_reps():
    if request.method == 'POST':
        # Use the access token to make an authenticated API request
        access_token = session.get('battlenet_token')
        headers = {'Authorization': 'Bearer {}'.format(access_token)}
        
        user_info = get_response('https://oauth.battle.net/userinfo?access_token=' + access_token, '')
        battletag = user_info['battletag']

        character_data = get_response('https://us.api.blizzard.com/profile/user/wow?namespace=profile-us&locale=en_US&access_token=' + access_token, headers)
        alts = []
        for account in character_data['wow_accounts']:
            for character in account['characters']:
                if character['level'] >= 70:
                    alt = {}
                    alt['account_id'] = account['id']
                    alt['name'] = character['name']
                    alt['character_id'] = character['id']
                    alt['level'] = character['level']
                    alt['realm'] = character['realm']['name']
                    alt['realm_slug'] = character['realm']['slug']
                    alt['realm_id'] = character['realm']['id']
                    alt['class'] = character['playable_class']['name']
                    alt['faction'] = character['faction']['name']

                    reps_data = get_response('https://us.api.blizzard.com/profile/wow/character/' + alt['realm_slug'] + '/' + alt['name'].lower() + '/reputations?namespace=profile-us&locale=en_US&access_token=' + access_token, headers)
                    reps = []
                    for item in reps_data['reputations']:
                        if item['faction']['id'] >= 2569:
                            rep = {}
                            rep['faction_name'] = item['faction']['name']
                            rep['faction_id'] = item['faction']['id']
                            rep['raw'] = item['standing']['raw']
                            rep['value'] = item['standing']['value']
                            rep['max'] = item['standing']['max']
                            rep['tier'] = ''
                            rep['renown_level'] = ''
                            if 'tier' in item['standing']:
                                rep['tier'] = item['standing']['tier']
                            if 'renown_level' in item['standing']:
                                rep['renown_level'] = item['standing']['renown_level']
                            rep['standing_name'] = item['standing']['name']
                            reps.append(rep)
                    alt['reps'] = reps
                    media = get_response('https://us.api.blizzard.com/profile/wow/character/' + alt['realm_slug'] + '/' + alt['name'].lower() + '/character-media?namespace=profile-us&locale=en_US&access_token=' + access_token, headers)
                    for asset in media['assets']:
                        if asset['key'] == 'avatar':
                            alt['avatar_image'] = asset['value']
                        if asset['key'] == 'inset':
                            alt['inset_image'] = asset['value']
                        if asset['key'] == 'main-raw':
                            alt['main_raw_image'] = asset['value']
                        if asset['key'] == 'main':
                            alt['main_image'] = asset['value']

                    profile_summary = get_response('https://us.api.blizzard.com/profile/wow/character/' + alt['realm_slug'] + '/' + alt['name'].lower() + '?namespace=profile-us&locale=en_US&access_token=' + access_token, headers)
                    timestamp = profile_summary['last_login_timestamp']/1000
                    alt['last_login'] = convert_timestamp(timestamp)

                    alts.append(alt)
        
        # print(characters)
        alts.sort(key=lambda x: (x['account_id'], x['level'], x['name']))
        return alts

@app.route('/get_rares', methods=['POST'])
def get_rares():
    if request.method == 'POST':
        then = datetime(2023, 2, 19, 12, 30, 0)
        now = datetime.now()
        duration = now - then
        duration_in_s = int(duration.total_seconds())
        minutes, remainder = divmod(duration_in_s, 60)
        loops, remainder = divmod(minutes, 840)
        rare_index, remainder = divmod(remainder, 30)
        if time.daylight:
            rare_index -= 1
        else:
            rare_index += 1

        # rare_timer = ceil_dt(now, timedelta(minutes=30))
        # print(rare_timer.timestamp())
        data = [gamedata.rares_list[(rare_index + j) % len(gamedata.rares_list)] for j in range(len(gamedata.rares_list))]

        rares = []
        for item in data:
            rare = {}
            rare['name'], rare['link'], rare['location'] = item
            rares.append(rare)
        return rares

@app.route('/data')
def data():
    # Use the access token to make an authenticated API request
    access_token = session.get('battlenet_token')
    print(access_token)
    headers = {'Authorization': 'Bearer {}'.format(access_token)}
    
    list_of_factions = get_response('https://us.api.blizzard.com/data/wow/reputation-faction/index?namespace=static-us&locale=en_US&access_token=' + access_token, headers)
    data = []
    for faction in list_of_factions['factions']:
        item = {}
        item['id'] = faction['id']
        item['name'] = faction['name']
        faction_detail = get_response('https://us.api.blizzard.com/data/wow/reputation-faction/' + str(item['id']) + '?namespace=static-us&locale=en_US&access_token=' + access_token, headers)
        if 'reputation_tiers' in faction_detail:
            item['reputation_tier_id'] = faction_detail['reputation_tiers']['id']
            tiers = get_response('https://us.api.blizzard.com/data/wow/reputation-tiers/' + str(item['reputation_tier_id']) + '?namespace=static-us&locale=en_US&access_token=' + access_token, headers)
            item['tiers'] = tiers['tiers']
            data.append(item)

    sorted_data = sorted(data, key=lambda x: x["name"])
    return render_template("data.html", data=sorted_data)



def convert_timestamp(timestamp):
    # convert the timestamp to a datetime object
    dt = datetime.fromtimestamp(timestamp, pytz.timezone('UTC'))

    # convert the datetime object to Central time
    central = dt.astimezone(pytz.timezone('America/Chicago'))

    # format the datetime object as a string in the desired format
    result = central.strftime('%a %d %b, %Y at %H:%M')

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