import zipfile
import xml.etree.ElementTree as ET

def read_docx(path):
    try:
        doc = zipfile.ZipFile(path)
        xml_content = doc.read('word/document.xml')
        tree = ET.fromstring(xml_content)
        texts = [node.text for node in tree.iter() if node.text]
        return ''.join(texts)
    except Exception as e:
        return str(e)

with open('oic_naming.txt', 'w', encoding='utf-8') as f:
    f.write(read_docx('OIC Naming Conventions and Best Practices-1.docx'))

with open('oic_review.txt', 'w', encoding='utf-8') as f:
    f.write(read_docx('ORACLE INTEGRATION CODE REVIEW.docx'))
