"""Module for loading and providing checklist data from JSON files.

This module provides a ChecklistLoader class that handles reading checklist
definitions and retrieving specific categories or items.
"""
import json
import os
import logging
from pathlib import Path
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

# Singleton instance
loader = ChecklistLoader()
