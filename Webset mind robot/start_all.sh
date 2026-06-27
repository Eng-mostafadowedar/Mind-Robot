#!/bin/bash
# ═══════════════════════════════════════════════════════
#  🤖 MindRobot — تشغيل كامل النظام + أوتو ريستارت
# ═══════════════════════════════════════════════════════
#  شغل:  bash start_all.sh
#  وقف:  Ctrl+C  أو  bash stop_all.sh
# ═══════════════════════════════════════════════════════

cd /home/mindrobot/Desktop/mindrobot || { echo "❌ المشروع مش موجود"; exit 1; }

PROJECT_DIR="/home/mindrobot/Desktop/mindrobot"
LOG_DIR="$PROJECT_DIR/logs"
SERVER_PORT=8000
MAX_RESTART=10          # أقصى عدد ريستارت (عشان ميعملش loop لو فيه مشكلة حقيقية)
RESTART_COUNT=0

# ─── الألوان ───
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

mkdir -p "$LOG_DIR"

echo -e "${CYAN}
╔══════════════════════════════════════════════╗
║   🤖 MindRobot — تشغيل + حماية أوتوماتيك    ║
╚══════════════════════════════════════════════╝${NC}"

# ═══════════════════════════════════════════════
#  1. تنظيف العمليات القديمة
# ═══════════════════════════════════════════════
echo -e "${YELLOW}[1/4] 🧹 تنظيف العمليات القديمة...${NC}"
pkill -f "api_server.py" 2>/dev/null
pkill -f "hr_sensor.py" 2>/dev/null
pkill -f "temp_sensor.py" 2>/dev/null
pkill -f "gsr_sensor.py" 2>/dev/null
sleep 1
echo -e "${GREEN}   ✅ تم${NC}"

# ═══════════════════════════════════════════════
#  2. إنشاء ملفات مفقودة
# ═══════════════════════════════════════════════
echo -e "${YELLOW}[2/4] 🔧 فحص الملفات...${NC}"
for f in hr_data.json temp_data.json gsr_data.json state.json stats_data.json patients_data.json; do
    [ ! -f "$f" ] && echo "{}" > "$f"
done
mkdir -p audio patients quick_checks chroma_db logs
echo -e "${GREEN}   ✅ تم${NC}"

# ═══════════════════════════════════════════════
#  دالة تشغيل السيرفر
# ═══════════════════════════════════════════════
start_server() {
    echo -e "${CYAN}🔄 تشغيل السيرفر...${NC}"
    python3 api_server.py > "$LOG_DIR/server.log" 2>&1 &
    SERVER_PID=$!
    echo "$SERVER_PID" > "$PROJECT_DIR/.server.pid"
}

# ═══════════════════════════════════════════════
#  دالة تشغيل السنسورات
# ═══════════════════════════════════════════════
start_sensors() {
    echo -e "${CYAN}📡 تشغيل السنسورات...${NC}"
    curl -s -X POST http://localhost:$SERVER_PORT/api/sensors/start > /dev/null 2>&1
}

# ═══════════════════════════════════════════════
#  3. تشغيل السيرفر
# ═══════════════════════════════════════════════
echo -e "${YELLOW}[3/4] 🚀 تشغيل السيرفر...${NC}"
start_server

# انتظار السيرفر يشتغل
echo -e "${YELLOW}⏳ انتظار السيرفر (30 ثانية)...${NC}"
for i in $(seq 1 30); do
    sleep 1
    if curl -s --connect-timeout 2 http://localhost:$SERVER_PORT/api/status | grep -q "ok"; then
        echo -e "${GREEN}   ✅ السيرفر شغال (PID: $SERVER_PID)${NC}"
        break
    fi
    echo -n "."
done
echo ""

# ═══════════════════════════════════════════════
#  4. تشغيل السنسورات
# ═══════════════════════════════════════════════
echo -e "${YELLOW}[4/4] 📡 تشغيل السنسورات...${NC}"
start_sensors
echo -e "${GREEN}   ✅ تم${NC}"

# ═══════════════════════════════════════════════
#  ✅ ملخص
# ═══════════════════════════════════════════════
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   🤖 MindRobot — شغال + محمي أوتوماتيك!      ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  🌐 http://localhost:$SERVER_PORT${NC}"
echo -e "${CYAN}║  🏠 http://localhost:$SERVER_PORT/Home/Home.html${NC}"
echo -e "${GREEN}║  🛡️  أوتو ريستارت: مفعل                     ${NC}"
echo -e "${GREEN}║  📋 اللوج: tail -f $LOG_DIR/server.log${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ═══════════════════════════════════════════════
#  🛡️ حلقة المراقبة — أوتو ريستارت
# ═══════════════════════════════════════════════
echo -e "${CYAN}🛡️  المراقبة شغالة... لو السيرفر وقف هيعمل ريستارت آلي${NC}"

while true; do
    sleep 10

    # فحص السيرفر
    if ! kill -0 $SERVER_PID 2>/dev/null; then
        RESTART_COUNT=$((RESTART_COUNT + 1))

        if [ $RESTART_COUNT -gt $MAX_RESTART ]; then
            echo -e "${RED}❌ السيرفر وقف $MAX_RESTART مرة! في مشكلة حقيقية.${NC}"
            echo -e "${RED}   شوف اللوج: tail -f $LOG_DIR/server.log${NC}"
            echo -e "${YELLOW}   وشغّل يدوي: bash start_all.sh${NC}"
            exit 1
        fi

        echo -e "${RED}⚠️  السيرفر وقف! ريستارت #$RESTART_COUNT ...${NC}"
        echo -e "${YELLOW}   السبب محتمل: $(tail -5 $LOG_DIR/server.log)${NC}"

        # تنظيف وريستارت
        pkill -f "api_server.py" 2>/dev/null
        sleep 2
        start_server

        # انتظار
        for i in $(seq 1 15); do
            sleep 1
            if curl -s --connect-timeout 2 http://localhost:$SERVER_PORT/api/status | grep -q "ok"; then
                echo -e "${GREEN}✅ السيرفر رجع شغال (PID: $SERVER_PID)${NC}"
                break
            fi
        done

        # ريستارت السنسورات مع السيرفر
        start_sensors
    fi

    # فحص السنسورات (لو السيرفر شغال بس السنسورات وقفت)
    if kill -0 $SERVER_PID 2>/dev/null; then
        SENSOR_CHECK=$(curl -s http://localhost:$SERVER_PORT/api/sensors/status 2>/dev/null)
        ALL_STOPPED=1
        echo "$SENSOR_CHECK" | grep -q '"running"' && ALL_STOPPED=0

        if [ $ALL_STOPPED -eq 1 ] && [ -n "$SENSOR_CHECK" ]; then
            echo -e "${YELLOW}⚠️  السنسورات وقفت — بتشغلها تاني...${NC}"
            start_sensors
            echo -e "${GREEN}   ✅ السنسورات رجعت${NC}"
        fi
    fi
done