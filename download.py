import json
import requests
import os
with open('final_result.json') as json_file:
    data = json.load(json_file)
if not os.path.exists('images'):
    os.mkdir('images')
for game in data:
    for trophy in game['trophyList']:
        url = trophy['trophyIconUrl']
        response = requests.get(url)
        filename = 'images/' + url.split("/")[-1]
        with open(filename, 'wb') as f:
            f.write(response.content)
