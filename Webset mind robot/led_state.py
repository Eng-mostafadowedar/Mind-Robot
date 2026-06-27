import json, os

STATE_FILE = "/home/mindrobot/Desktop/mindrobot/state.json"

def set_state(state="idle"):
    try:
        with open(STATE_FILE, "w") as f:
            json.dump({"state": state}, f)
    except Exception as e:
        print(f"[LED State] Error: {e}")