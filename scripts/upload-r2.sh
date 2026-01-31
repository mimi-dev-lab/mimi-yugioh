#!/bin/bash
# 批量上传图片到 R2

BUCKET="yugioh-cards"
SRC_DIR="$HOME/clawd/projects/yugioh_cards/images"
LANG=$1  # cn 或 jp

if [ -z "$LANG" ]; then
    echo "Usage: $0 <cn|jp>"
    exit 1
fi

cd ~/clawd/projects/mimi-yugioh

# 统计总数
TOTAL=$(ls "$SRC_DIR/$LANG"/*.webp 2>/dev/null | wc -l | tr -d ' ')
echo "开始上传 $LANG 图片，共 $TOTAL 张..."

# 并行上传 (8 个并发)
COUNT=0
for file in "$SRC_DIR/$LANG"/*.webp; do
    filename=$(basename "$file")
    ((COUNT++))
    
    # 每 100 张显示进度
    if [ $((COUNT % 100)) -eq 0 ]; then
        echo "进度: $COUNT / $TOTAL"
    fi
    
    npx wrangler r2 object put "$BUCKET/$LANG/$filename" --file "$file" --content-type image/webp --remote 2>/dev/null &
    
    # 控制并发数
    if [ $((COUNT % 8)) -eq 0 ]; then
        wait
    fi
done

wait
echo "✅ $LANG 上传完成！共 $COUNT 张"
