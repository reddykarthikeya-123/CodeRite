import json
import os
from pathlib import Path

# Path to the JSON file
BASE_DIR = Path(__file__).resolve().parent.parent
CHECKLIST_FILE = BASE_DIR / "checklists_clean.json"

class ChecklistLoader:
    def __init__(self):
        self.checklists = self._load()

    def _load(self):
        try:
            with open(CHECKLIST_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading checklists: {e}")
            return {"sheets": [], "data": {}}

    def get_categories(self) -> list:
        return self.checklists.get("sheets", [])

    def get_checklist_for_category(self, category: str) -> list:
        return self.checklists.get("data", {}).get(category, [])

# Singleton instance
loader = ChecklistLoader()
