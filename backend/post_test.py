import io
from PIL import Image
import requests
img = Image.new('RGB',(224,224),(128,200,100))
buf = io.BytesIO(); img.save(buf,'PNG'); buf.seek(0)
files = {'image': ('test.png', buf, 'image/png')}
data = {'crop':'Tomate'}
resp = requests.post('http://127.0.0.1:8000/analyze', files=files, data=data, timeout=30)
print('status', resp.status_code)
print(resp.text)
