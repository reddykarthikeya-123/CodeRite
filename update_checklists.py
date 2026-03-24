import json
import math

def get_nan():
    return float('nan')

# Review checklists
oracle_review = {
    "Section 1: Integration Design Review": [
        "Does the integration name align with naming standards?",
        "Does the integration name address the business purpose?",
        "Does The integration Versioning Defined Properly?",
        "Does integration description added in Integration level?",
        "Is the selected Integration pattern suitable and justified for the business solution?",
        "Does integration have any hardcoded URL’s or credentials?",
        "Is Proper tracking defined for the integrations?",
        "Is integration placed in the correct folder structure or project?",
        "Are lookups used instead of hardcoding?",
        "Integration reusable?",
        "Is Orchestration justified, or could it be simplified?"
    ],
    "Section 2: Connections & Security": [
        "Does the connection name follows naming standards?",
        "Did the connection used appropriate authentication method? (Like OAuth/Basic/API Key)",
        "Did connections have hardcoded credentials?",
        "Does the security policies are added for each connection?",
        "For third party connection SSL Certification validated for expiry?"
    ],
    "Section 3: Lookups & Cross-Reference": [
        "Are lookup names conforming to naming standards?",
        "Is the lookup placed in the appropriate folder?",
        "Are hard-coded values avoided and replaced with lookups where applicable?",
        "Are lookup values properly documented in the design document?",
        "Is there proper error handling for missing lookup or cross-reference values?",
        "Are lookups environment-independent (no environment-specific hardcoding)?",
        "Has impact analysis been performed before modifying existing lookup values?"
    ],
    "Section 4: Orchestration & Mapping": [
        "Did the integration modularize the business logic appropriately?",
        "Are scope blocks used appropriately within the integration?",
        "Are fault handlers implemented where required?",
        "Is a global fault handler configured for the integration?",
        "Are switch conditions optimized for better performance and readability?",
        "Are for-each loops optimized to handle data efficiently?",
        "Does the integration avoid unnecessary nested loops?",
        "Are data mappings clean, structured, and easy to understand?",
        "Are lookup tables used instead of hard-coded values inside mapping?",
        "Are cross-references used properly wherever required?",
        "Has large payload handling been considered in the integration design?",
        "Is retry logic implemented where external system failures may occur?"
    ],
    "Section 5: Error Handling & Logging": [
        "Does the global fault handler is implemented?",
        "Does the error Logged for tracking ?",
        "Does the retry mechanism implemented where required?",
        "Are business errors and technical errors handled separately?",
        "Are meaningful error messages returned for failure scenarios?",
        "Does the integration avoid logging sensitive data?",
        "Are notifications (Email/Teams) configured for failure scenarios?",
        "Are integration instance tracking and business identifiers configured?"
    ],
    "Section 6: Performance & Optimization": [
        "Does the integration avoid unnecessary database calls?",
        "Does the integration avoid making external calls inside loops?",
        "Is pagination used when processing large datasets?",
        "Is parallel processing used where appropriate to improve performance?",
        "Has high-volume testing been completed for the integration?",
        "Is the payload size optimized for performance?",
        "Is payload streaming or stage file used for very large files?"
    ],
    "Section 7: External System Compliance": [
        "Are standard APIs used?",
        "Are REST / SOAP / FBDI services used appropriately?",
        "Is Business Unit / Multi-Org handling validated?",
        "Is data validation performed before submission?",
        "Is idempotency handled where required?"
    ],
    "Section 8: Testing and Deployment": [
        "Are Unit test cases add for each integration?",
        "Did negative scenarios are tested?",
        "Did error scenarios are validated and tested to ensure proper error handling?",
        "Has the deployment checklist been followed before migration?",
        "Has the .IAR file been validated before migrating to the target environment?",
        "Has a post-deployment smoke test been completed successfully?"
    ],
    "Section 9: Scheduling (If Applicable)": [
        "Does the scheduling frequency configured appropriately based on business requirement?",
        "Does the time zone been validated for the scheduling integration?",
        "Does the alerts are configured for integration failures?",
        "Did the overlapping integration run prevention implemented?"
    ],
    "Section 10: Standards & Governance": [
        "Are naming standards followed across all integration artifacts?",
        "Are there any test endpoints present in the Production environment?",
        "Does the integration avoid environment-specific hardcoding?",
        "Is the documentation updated to reflect the latest changes?",
        "Is the change ticket referenced in the integration?",
        "Has the integration version been updated before migration?"
    ],
    "Section 11: Other": [
        "Do all names conform to standards?",
        "Does functional Documentation exist? Is it clear and complete?",
        "Does the TDD Document cover all the required details along with flow chart?",
        "Does testcase document cover all the positive and negative scenarios and been tested?"
    ]
}

oic_naming = {
    "General Naming Guidelines": [
        "All names are spelled out fully without unapproved abbreviations (exceptions include common accepted terms like ERP, HCM, AR, AP, SF).",
        "Artifact names use only alphanumeric characters and underscores or Pascal Case.",
        "No special characters are used in names (avoid spaces, '.', '$', '%', '#', []).",
        "Artifact types are clearly indicated using suffixes (e.g., COUNTRIES_LOOKUP).",
        "Project names conform to standard convention `<CUST_PREFIX>_<MODULE_NAME>_PROJECT`.",
        "Common utility assets are grouped in a common project `<CUST_PREFIX>_COMMON_PROJECT`."
    ],
    "Integration Design": [
        "Integration Flow names conform strictly to `<CUST_PREFIX>_<INT_NUM>_<SOURCE>_<TARGET>_<DATA_OBJECT>_<OPERATION>_<TYPE>`.",
        "Connection names adhere to `<CUST_PREFIX>_<SYSTEM>_<ADAPTER_NAME>` and duplication is minimal.",
        "Lookups properly indicate their short purpose and end with `_LKP` prefix.",
        "Initial lookup variables are assigned locally instead of mapped directly inside flow blocks."
    ],
    "Code Components & Variables": [
        "Assignment tasks are prefixed with 'Assign' (e.g., AssignOrderValues).",
        "Data Stitch tasks denote their operation via 'Assign', 'Append', or 'Remove'.",
        "Scope blocks are explicitly labeled with suffix `Scope` or `{Scope}`.",
        "For-each iteration blocks begin with `IterateOver` or `ForEach`.",
        "While loops begin with `While` and specify the condition concisely.",
        "Logger blocks begin with `Log` to clearly designate what is being logged.",
        "Notification modules start with `Email` followed by topic context."
    ],
    "XML & Schema Mapping": [
        "Lower-Camel-case is maintained for all XML attributes.",
        "Upper-Camel-case is maintained for all XML complex elements and type names.",
        "Names remain singular unless strictly representing arrays.",
        "All complex schemas maintain the 'Type' suffix descriptor (e.g., InvoiceEBOType)."
    ],
    "Architectural Best Practices": [
        "Integration relies on appropriate shared central connections rather than creating redundant developer connections.",
        "Scheduled routines use list limits appropriately and don't loop endlessly; run-now triggers or schedule params are utilized where possible.",
        "Synchronous integration complexity is minimized to basic handoffs; avoids performing large monolithic processing inside blocking calls.",
        "Processors don't buffer massive entire payload files into memory; Stage File chunking / Segment iteration is preferred.",
        "Chatty per-record API invocations are avoided; external API batched calls (200, 1000 records context) are mapped.",
        "IAR updates or complex XSLs occur strictly within Mapper import functions, bypassing manual XML outside edits.",
        "Underlying DB / REST limits are analyzed in line with payload estimates to avoid abrupt buffer limits."
    ]
}

files_to_modify = ['backend/checklists.json', 'backend/checklists_clean.json']

def add_sheet_data(data, sheet_name, content_dict):
    if sheet_name not in data["sheets"]:
        data["sheets"].append(sheet_name)
    
    # Reset or initialize the list
    data["data"][sheet_name] = [
        {"QA Reviewer Name": "Section", "Unnamed: 1": "Checklist Item", "Unnamed: 2": "Review Result"}
    ]
    
    for section_name, items in content_dict.items():
        if not items:
            continue
        
        for i, item in enumerate(items):
            reviewer_val = section_name if i == 0 else get_nan()
            new_row = {
                "QA Reviewer Name": reviewer_val,
                "Unnamed: 1": item,
                "Unnamed: 2": get_nan()
            }
            data["data"][sheet_name].append(new_row)

for file_path in files_to_modify:
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    add_sheet_data(data, "Oracle Integration Code Review", oracle_review)
    add_sheet_data(data, "OIC Naming Conventions & Best Practices", oic_naming)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        # We allow_nan so it writes unquoted NaN.
        json.dump(data, f, indent=2, allow_nan=True)

print("Checklists updated successfully.")
