
import csv
import json
import subprocess
import os
import time

SUPABASE_URL = 'https://fcbsekidlijtidqzkddx.supabase.co'
SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjYnNla2lkbGlqdGlkcXprZGR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzgzMDAsImV4cCI6MjA4ODI1NDMwMH0.nOSFfSYw0_xAF9zt4S1qpppsCX3cD7BzRJoJI33Kxoo'
TABLE_NAME = 'teachers'

def import_with_curl():
    csv_file = 'data/faculty/hkbu_teachers_master_v3.csv'
    url = f"{SUPABASE_URL}/rest/v1/{TABLE_NAME}"
    
    # 1. Clear old data to prevent duplicates
    print("正在清空旧数据以防止重复...")
    # SQL query style deletion via PosgREST: delete where id is not null (guaranteed to match all)
    # Using curl -k for safety in restricted environments
    delete_cmd = [
        "curl", "-k", "-X", "DELETE",
        f"{url}?id=neq.00000000-0000-0000-0000-000000000000",
        "-H", f"apikey: {SUPABASE_ANON_KEY}",
        "-H", f"Authorization: Bearer {SUPABASE_ANON_KEY}"
    ]
    try:
        subprocess.run(delete_cmd, capture_output=True, text=True)
        print("旧数据清空指令已发送")
        time.sleep(1) # Give Supabase a moment
    except Exception as e:
        print(f"清空数据指令执行失败: {e}")

    # 2. Process CSV
    records = []
    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            image_url = row['ImageURL']
            source_url = row['SourceURL']
            
            # Domain prefix mapping for photo fixes
            if image_url and not image_url.startswith('http'):
                clean_img = image_url.lstrip('/')
                if 'comp.hkbu.edu.hk' in source_url:
                    image_url = f'https://www.comp.hkbu.edu.hk/{clean_img}'
                elif any(d in source_url for d in ['coms.hkbu.edu.hk', 'imd.hkbu.edu.hk', 'jour.hkbu.edu.hk']):
                    image_url = f'https://www.hkbu.edu.hk/{clean_img}'
                elif 'scholars.hkbu.edu.hk' in source_url:
                    image_url = f'https://scholars.hkbu.edu.hk/{clean_img}'
                elif 'bus.hkbu.edu.hk' in source_url:
                    image_url = f'https://bus.hkbu.edu.hk/{clean_img}'
                elif 'phys.hkbu.edu.hk' in source_url:
                    image_url = f'https://phys.hkbu.edu.hk/{clean_img}'
                else:
                    image_url = f'https://www.hkbu.edu.hk/{clean_img}'
            
            records.append({
                "faculty": row['Faculty'],
                "department": row['Department'],
                "name": row['Name'],
                "title": row['Title'],
                "image_url": image_url,
                "email": row['Email'],
                "source_url": source_url
            })

    # 3. Batch import via curl
    batch_size = 50
    temp_file = 'temp_batch.json'
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        print(f"正在导入批次 {i//batch_size + 1}...")
        
        with open(temp_file, 'w', encoding='utf-8') as tf:
            json.dump(batch, tf)
        
        cmd = [
            "curl", "-k", "-X", "POST", url,
            "-H", f"apikey: {SUPABASE_ANON_KEY}",
            "-H", f"Authorization: Bearer {SUPABASE_ANON_KEY}",
            "-H", "Content-Type: application/json",
            "-H", "Prefer: return=minimal",
            "-d", f"@{temp_file}"
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            print(f"批次 {i//batch_size + 1} 导入成功")
        else:
            print(f"批次 {i//batch_size + 1} 导入失败: {result.stderr}")
    
    if os.path.exists(temp_file):
        os.remove(temp_file)
    print("全量数据同步完成！")

if __name__ == '__main__':
    import_with_curl()
