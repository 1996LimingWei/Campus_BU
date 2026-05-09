
import csv
import requests
import json
import urllib3

# 禁用 SSL 警告
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Supabase 配置
SUPABASE_URL = 'https://fcbsekidlijtidqzkddx.supabase.co'
SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjYnNla2lkbGlqdGlkcXprZGR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzgzMDAsImV4cCI6MjA4ODI1NDMwMH0.nOSFfSYw0_xAF9zt4S1qpppsCX3cD7BzRJoJI33Kxoo'
TABLE_NAME = 'teachers'

def import_data():
    csv_file = 'data/faculty/hkbu_teachers_master_v3.csv'
    
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    url = f"{SUPABASE_URL}/rest/v1/{TABLE_NAME}"
    
    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        records = []
        for row in reader:
            record = {
                "faculty": row['Faculty'],
                "department": row['Department'],
                "name": row['Name'],
                "title": row['Title'],
                "image_url": row['ImageURL'],
                "email": row['Email'],
                "source_url": row['SourceURL']
            }
            records.append(record)
    
    # 分批导入 (每批 50 条)
    batch_size = 50
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        try:
            response = requests.post(url, headers=headers, data=json.dumps(batch), verify=False)
            if response.status_code in [200, 201]:
                print(f"成功导入批次 {i//batch_size + 1}")
            else:
                print(f"导入批次 {i//batch_size + 1} 失败: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"请求异常: {e}")

if __name__ == '__main__':
    import_data()
