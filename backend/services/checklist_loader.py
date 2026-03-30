"""Module for loading and providing checklist data from JSON files.

This module provides a ChecklistLoader class that handles reading checklist
definitions and retrieving specific categories or items.
"""
import json
from pathlib import Path
from typing import Any, Dict, List, Optional
from config.logging_config import get_logger

logger = get_logger(__name__)

# Path to the JSON file
BASE_DIR = Path(__file__).resolve().parent.parent
CHECKLIST_FILE = BASE_DIR / "checklists_clean.json"

class ChecklistLoader:
    """Loader and provider for audit checklists."""
    
    def __init__(self):
        """Initializes the ChecklistLoader."""
        self.checklists = self._load()

    def _load(self) -> dict:
        """Internal method to load checklist data from the JSON file.

        Returns:
            A dictionary containing the checklist data.
        """
        try:
            with open(CHECKLIST_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading checklists: {e}")
            return {"sheets": [], "data": {}}

    def get_categories(self) -> list:
        """Retrieves all available checklist categories.

        Returns:
            A list of category names (sheets).
        """
        # Load dynamically so changes to JSON are reflected without restart
        checklists = self._load()
        return checklists.get("sheets", [])

    def get_checklist_for_category(self, category: str) -> list:
        """Retrieves the checklist items for a specific category.

        Args:
            category: The name of the category to retrieve.

        Returns:
            A list of checklist items.
        """
        checklists = self._load()
        return checklists.get("data", {}).get(category, [])

    @staticmethod
    def _normalize_checklist_item(item: Dict[str, Any], index: int) -> Optional[Dict[str, Any]]:
        """Return a single normalized checklist item or None when the row is not actionable."""
        check_text = str(
            item.get("ChecklistItem")
            or item.get("checklist_item")
            or item.get("Unnamed: 1")
            or ""
        ).strip()
        if not check_text or check_text == "Checklist Item":
            return None

        section = str(
            item.get("Section")
            or item.get("section")
            or item.get("QA Reviewer Name")
            or "General"
        ).strip() or "General"

        return {
            "id": str(index),
            "index": index,
            "section": section,
            "checklist_item": check_text,
        }

    def get_checklist_items_for_category(self, category: str) -> List[Dict[str, Any]]:
        """Return normalized actionable checklist items for a category."""
        normalized_items: List[Dict[str, Any]] = []
        for index, item in enumerate(self.get_checklist_for_category(category)):
            normalized_item = self._normalize_checklist_item(item, index)
            if normalized_item:
                normalized_items.append(normalized_item)
        return normalized_items

    def get_selected_checklist_items(
        self,
        category: str,
        enabled_checks: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Return normalized checklist items filtered by selected item ids.

        Supports both the current compact `id` form and the legacy `index-text`
        form used by older frontend payloads.
        """
        checklist_items = self.get_checklist_items_for_category(category)
        if not enabled_checks:
            return checklist_items

        selected_ids = {
            str(raw_value).split("-", 1)[0].strip()
            for raw_value in enabled_checks
            if str(raw_value).strip()
        }
        if not selected_ids:
            return []

        return [
            item for item in checklist_items
            if str(item.get("id")) in selected_ids or str(item.get("index")) in selected_ids
        ]

# Singleton instance
loader = ChecklistLoader()
