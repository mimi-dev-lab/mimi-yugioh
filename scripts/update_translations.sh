#!/bin/bash
# 批量从 YGOCDB 获取并更新缺失的翻译数据

echo "Fetching missing card IDs..."
MISSING_IDS=$(docker exec supabase_db_mimi-yugioh psql -U postgres -d postgres -t -A -c "
SELECT id FROM cards 
WHERE (name_cn IS NULL OR name_cn = '') OR (name_jp IS NULL OR name_jp = '')
ORDER BY id;
")

TOTAL=$(echo "$MISSING_IDS" | wc -l | tr -d ' ')
echo "Found $TOTAL cards with missing translations"

UPDATED=0
NOT_FOUND=0

for ID in $MISSING_IDS; do
    if [ -z "$ID" ]; then continue; fi
    
    # 从 YGOCDB 获取数据
    DATA=$(curl -s "https://ygocdb.com/api/v0/?search=$ID" 2>/dev/null)
    
    # 提取中日文名和描述
    CN_NAME=$(echo "$DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result'][0]['cn_name'] if d.get('result') else '')" 2>/dev/null)
    JP_NAME=$(echo "$DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result'][0]['jp_name'] if d.get('result') else '')" 2>/dev/null)
    DESC_CN=$(echo "$DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result'][0]['text']['desc'] if d.get('result') else '')" 2>/dev/null)
    
    if [ -n "$CN_NAME" ] || [ -n "$JP_NAME" ]; then
        echo "[$ID] Found: CN=$CN_NAME, JP=$JP_NAME"
        
        # 构建 UPDATE SQL
        UPDATES=""
        if [ -n "$CN_NAME" ]; then
            ESCAPED_CN=$(echo "$CN_NAME" | sed "s/'/''/g")
            UPDATES="name_cn = '$ESCAPED_CN'"
        fi
        if [ -n "$JP_NAME" ]; then
            ESCAPED_JP=$(echo "$JP_NAME" | sed "s/'/''/g")
            [ -n "$UPDATES" ] && UPDATES="$UPDATES, "
            UPDATES="${UPDATES}name_jp = '$ESCAPED_JP'"
        fi
        if [ -n "$DESC_CN" ]; then
            ESCAPED_DESC=$(echo "$DESC_CN" | sed "s/'/''/g")
            [ -n "$UPDATES" ] && UPDATES="$UPDATES, "
            UPDATES="${UPDATES}desc_cn = '$ESCAPED_DESC'"
        fi
        
        if [ -n "$UPDATES" ]; then
            docker exec supabase_db_mimi-yugioh psql -U postgres -d postgres -c "UPDATE cards SET $UPDATES WHERE id = $ID;" > /dev/null
            UPDATED=$((UPDATED + 1))
        fi
    else
        echo "[$ID] Not found"
        NOT_FOUND=$((NOT_FOUND + 1))
    fi
    
    sleep 0.2  # Rate limiting
done

echo ""
echo "=== Summary ==="
echo "Updated: $UPDATED"
echo "Not found: $NOT_FOUND"
