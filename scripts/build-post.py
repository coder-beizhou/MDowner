#!/usr/bin/env python3
import os
import json
import zipfile
import shutil
import sys

dist = os.path.join(os.path.dirname(__file__), '..', 'dist')
dist = os.path.normpath(dist)

# 读取版本号
pkg_path = os.path.join(os.path.dirname(__file__), '..', 'package.json')
with open(pkg_path, 'r', encoding='utf-8') as f:
    pkg = json.load(f)
    product_name = pkg.get('build', {}).get('productName') or pkg['name']
    version = pkg['version']

zip_name = f'{product_name}_ZipPkg_{version}.zip'

to_delete = [
    'win-unpacked',
    f'{product_name}_Setup_{version}.exe.blockmap',
    'builder-debug.yml',
    'builder-effective-config.yaml',
]

# 1. 打包 zip
unpacked = os.path.join(dist, 'win-unpacked')
if os.path.exists(unpacked):
    zip_path = os.path.join(dist, zip_name)
    if os.path.exists(zip_path):
        os.remove(zip_path)
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(unpacked):
            for file in files:
                fp = os.path.join(root, file)
                arcname = os.path.relpath(fp, unpacked)
                zf.write(fp, arcname)
    size_mb = os.path.getsize(zip_path) / 1024 / 1024
    print(f'打包: {zip_name} ({size_mb:.1f}MB)')
else:
    print('win-unpacked 不存在，跳过打包')

# 2. 清理中间文件
for name in to_delete:
    p = os.path.join(dist, name)
    if os.path.exists(p):
        if os.path.isdir(p):
            shutil.rmtree(p)
        else:
            os.remove(p)
        print(f'删除: {name}')

print('构建后处理完成')
