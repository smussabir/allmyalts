# import requests

# code = request.args.get('code')

# # Exchange the authorization code for an access token
# data = {
#     'client_id': CLIENT_ID,
#     'client_secret': CLIENT_SECRET,
#     'code': code,
#     'redirect_uri': 'http://localhost:5000/alts',
#     'grant_type': 'authorization_code'
# }
# resp = requests.post('https://us.battle.net/oauth/token', data=data)
# resp_json = json.loads(resp.text)
# print(resp_json)
# access_token = resp_json['access_token']
# # Replace YOUR_API_KEY with your actual API key
# api_key = "USA7yq9HFl122cLJ5UJiNP8EtwsoiZf0Bd"

# # Make a GET request to the API endpoint for checking the token
# response = requests.get(f"https://oauth.battle.net/oauth/token?token={api_key}", headers={
#     "Authorization": f"Bearer {api_key}"
# })

# # Check the response status code
# if response.status_code == 200:
#     print("Token is valid")
# else:
#     print("Token is invalid")

from datetime import datetime, timedelta

def ceil_dt(dt, delta):
    return dt + (datetime.min - dt) % delta

rares = [
    ('Phleep', 'https://www.wowhead.com/npc=193210/phleep'),
    ('Magmaton', 'https://www.wowhead.com/npc=186827/magmaton'),
    ('Gruffy', 'https://www.wowhead.com/npc=193251/gruffy'),
    ('Ronsak the Decimator', 'https://www.wowhead.com/npc=193227/ronsak-the-decimator'),
    ('Riverwalker Tamopo', 'https://www.wowhead.com/npc=193240/riverwalker-tamopo'),
    ('Amethyzar the Glittering', 'https://www.wowhead.com/npc=193132/amethyzar-the-glittering'),
    ('Eldoren the Reborn', 'https://www.wowhead.com/npc=193234/eldoren-the-reborn'),
    ('skip', ''),
    ('Skag the Thrower', 'https://www.wowhead.com/npc=193149/skag-the-thrower'),
    ('Mikrin of the Raging Winds', 'https://www.wowhead.com/npc=193173/mikrin-of-the-raging-winds'),
    ('Rokmur', 'https://www.wowhead.com/npc=193666/rokmur'),
    ('Smogswog the Firebreather', 'https://www.wowhead.com/npc=193120/smogswog-the-firebreather'),
    ('Matriarch Remalla', 'https://www.wowhead.com/npc=193246/matriarch-remalla'),
    ('O\'nank Shorescour', 'https://www.wowhead.com/npc=193118/onank-shorescour'),
    ('Researcher Sneakwing', 'https://www.wowhead.com/npc=196010/researcher-sneakwing'),
    ('Treasure-Mad Trambladd', 'https://www.wowhead.com/npc=193221/treasure-mad-trambladd'),
    ('Harkyn Grymstone', 'https://www.wowhead.com/npc=186200/harkyn-grymstone'),
    ('Fulgurb', 'https://www.wowhead.com/npc=193170/fulgurb'),
    ('Sandana the Tempest', 'https://www.wowhead.com/npc=193176/sandana-the-tempest'),
    ('Gorjo the Crab Shackler', 'https://www.wowhead.com/npc=193226/gorjo-the-crab-shackler'),
    ('Steamgill', 'https://www.wowhead.com/npc=193123/steamgill'),
    ('Tempestrian', 'https://www.wowhead.com/npc=193258/tempestrian'),
    ('Massive Magmashell', 'https://www.wowhead.com/npc=193152/massive-magmashell'),
    ('Grumbletrunk', 'https://www.wowhead.com/npc=193269/grumbletrunk'),
    ('Oshigol', 'https://www.wowhead.com/npc=193235/oshigol'),
    ('Broodweaver Araznae', 'https://www.wowhead.com/npc=193220/broodweaver-araznae'),
    ('Azra\'s Prized Peony', 'https://www.wowhead.com/npc=193135/azras-prized-peony'),
    ('Malsegan', 'https://www.wowhead.com/npc=193212/malsegan')
]
   
then = datetime(2023, 2, 19, 12, 30, 0)
now = datetime.now()
duration = now - then
print(f"Duration: {duration}")
duration_in_s = int(duration.total_seconds())
print(f"Duration in secs: {duration_in_s}")
minutes, remainder = divmod(duration_in_s, 60)
print(f"Minutes: {minutes}")
loops, remainder = divmod(minutes, 840)
print(f"Loops: {loops}, Remainder: {remainder}")

rare_index, remainder = divmod(remainder, 30)
rare_index += 1
print(f"Index: {rare_index}, Remainder: {remainder}")
rare_name, link = rares[rare_index]
rare_timer = ceil_dt(now, timedelta(minutes=30))

rare_spawns = [rares[(rare_index + j) % len(rares)] for j in range(len(rares))]
for rare in rare_spawns:
    rare_name, link = rare
    if rare_name != 'skip':
        print(f"{rare_timer.strftime('%m/%d %I:%M%p')} : {rare_name}")
    rare_timer = rare_timer + timedelta(minutes=30)
