import pandas as pd
import json

file_path = r"C:\Users\Karthikeya Reddy\OneDrive - RITE\Desktop\Office Work\AKM\Code-Scorer\Functional_Deliverables_Quality_Review_Checklist__v1.0.xlsx"
try:
    xls = pd.ExcelFile(file_path)
    output = {"sheets": xls.sheet_names, "data": {}}
    
    for sheet in xls.sheet_names:
        df = pd.read_excel(xls, sheet_name=sheet, skiprows=7)
        df = df.dropna(how='all').dropna(axis=1, how='all')
        
        # Clean column names (strip whitespace, ensure string)
        df.columns = [str(c).strip() for c in df.columns]
        
        records = df.to_dict(orient='records')
        output["data"][sheet] = records
        
    with open('checklists.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, default=str)
    print("Successfully extracted to checklists.json")
except Exception as e:
    import traceback
    traceback.print_exc()
