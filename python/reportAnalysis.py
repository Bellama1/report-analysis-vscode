import requests
import os
import sys
import json
import urllib.request
import urllib.parse
from lxml import etree
import threading
import re
import datetime
import time
from email.utils import parsedate_to_datetime
from concurrent.futures import ThreadPoolExecutor

REQUEST_TIMEOUT_SECONDS = 15

class GetReport:
    def __init__(self,reportUrl):
        self.reportUrl = reportUrl
        self.localRoot = self._getLocalRoot(reportUrl)
        if self.localRoot is None and not self.reportUrl.endswith('/'):
            self.reportUrl += '/'

    def _getLocalRoot(self, report_source):
        if report_source.lower().startswith('file://'):
            parsed_path = urllib.parse.unquote(urllib.parse.urlparse(report_source).path)
            if os.name == 'nt' and re.match(r'^/[A-Za-z]:', parsed_path):
                parsed_path = parsed_path[1:]
            return os.path.abspath(parsed_path)
        if not re.match(r'^https?://', report_source, re.IGNORECASE):
            return os.path.abspath(os.path.expanduser(report_source))
        return None

    def _analysisPath(self, version, *parts):
        if self.localRoot is None:
            raise ValueError('A local report root is required for this operation')
        segments = [self._safeSegment(version), 'ReportAnalysis']
        segments.extend(self._safeSegment(part) for part in parts)
        file_path = os.path.abspath(os.path.join(self.localRoot, *segments))
        if os.path.commonpath([self.localRoot, file_path]) != self.localRoot:
            raise ValueError('Report path is outside the configured report root')
        return file_path

    def _safeSegment(self, value):
        segment = str(value).strip()
        if not segment or segment in ('.', '..') or os.path.isabs(segment):
            raise ValueError(f'Invalid report path segment: {value}')
        if '/' in segment or '\\' in segment or os.path.basename(segment) != segment:
            raise ValueError(f'Invalid report path segment: {value}')
        return segment

    def _cachePath(self, file_name):
        cache_dir = os.path.join(os.path.expanduser('~'), 'Report Analysis')
        os.makedirs(cache_dir, exist_ok=True)
        return os.path.join(cache_dir, self._safeSegment(file_name))

    def _downloadJson(self, url, file_name):
        response = requests.get(url, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        data = response.json()
        file_path = self._cachePath(file_name)
        with open(file_path, 'w', encoding='utf-8') as file_object:
            json.dump(data, file_object, ensure_ascii=True)
        return file_path

    def _loadLocalJson(self, version, *parts):
        file_path = self._analysisPath(version, *parts)
        with open(file_path, 'r', encoding='utf-8') as file_object:
            return json.load(file_object)

    def parseModifiedTime(self, text):
        modified_match = re.search(
            r'(\d{2}-\s*[A-Za-z]{3}-\d{4}\s+\d{2}:\d{2})',
            text or '',
            re.IGNORECASE
        )
        try:
            modified_text = modified_match.group(1) if modified_match else ''
            return datetime.datetime.strptime(re.sub(r'\s+', '', modified_text), "%d-%b-%Y%H:%M")
        except (AttributeError, ValueError):
            return datetime.datetime.min
    
    def getHrefList(self,linkUrl):
        try:
            request = urllib.request.Request(url=linkUrl)
            response = urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS)
            content = response.read().decode('utf-8')
            parse_html = etree.HTML(content)
            return parse_html.xpath("//a/@href")
        except Exception as e:
            return []

    def getFailedScriptCount(self, reportAnalysisUrl):
        try:
            analysis_content = requests.get(reportAnalysisUrl, timeout=REQUEST_TIMEOUT_SECONDS).text
            analysis_json = json.loads(analysis_content)
            failed_cases = analysis_json.get("failedCases", [])
            if isinstance(failed_cases, list):
                return len(failed_cases)
            return 0
        except Exception:
            return 0
    
    def getVersionEntries(self, on_latest=None):
        if self.localRoot is not None:
            if not os.path.isdir(self.localRoot):
                raise FileNotFoundError(f'Report source does not exist: {self.localRoot}')
            versions = []
            for version in os.listdir(self.localRoot):
                analysis_path = self._analysisPath(version)
                if os.path.isdir(analysis_path):
                    versions.append({
                        "name": version,
                        "modified": datetime.datetime.fromtimestamp(os.path.getmtime(analysis_path))
                    })
            versions.sort(key=lambda item: (item["modified"], item["name"]), reverse=True)
            if versions and on_latest is not None:
                on_latest(versions[0]["name"])
            return versions

        response = requests.get(self.reportUrl, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        directory_page = etree.HTML(response.text)
        versions = []
        for anchor in directory_page.xpath('//a[@href]'):
            href = anchor.get('href', '')
            if not href.endswith('/') or href in ('/', '../'):
                continue
            version = href.rstrip('/')
            try:
                self._safeSegment(version)
            except ValueError:
                continue
            versions.append({"name": version, "modified": self.parseModifiedTime(anchor.tail)})

        versions.sort(key=lambda item: (item["modified"], item["name"]), reverse=True)

        def validate_report_version(version_entry):
            try:
                report_analysis_url = (
                    f'{self.reportUrl}{version_entry["name"]}/'
                    'ReportAnalysis/'
                )
                report_analysis_response = requests.head(
                    report_analysis_url,
                    timeout=REQUEST_TIMEOUT_SECONDS,
                    allow_redirects=True
                )
                report_analysis_response.raise_for_status()
                last_modified = report_analysis_response.headers.get('Last-Modified')
                if last_modified:
                    version_entry["modified"] = parsedate_to_datetime(last_modified).replace(tzinfo=None)
                return version_entry
            except requests.RequestException:
                pass
            except (TypeError, ValueError):
                return version_entry
            return None

        with ThreadPoolExecutor(max_workers=min(32, max(1, len(versions)))) as executor:
            validated_versions = []
            for version in executor.map(validate_report_version, versions):
                if version is not None:
                    if not validated_versions and on_latest is not None:
                        on_latest(version["name"])
                    validated_versions.append(version)
        versions = validated_versions
        versions = [version for version in versions if version is not None]
        versions.sort(key=lambda item: (item["modified"], item["name"]), reverse=True)
        return versions

    def getVersionItems(self, version, view_type):
        version = self._safeSegment(version)
        if self.localRoot is not None:
            report_path = self._analysisPath(version, 'author') if view_type == 'author' else self._analysisPath(version)
            if not os.path.isdir(report_path):
                return []
            links = [name for name in os.listdir(report_path) if name.endswith('_reportAnalysis.json')]

            def create_local_item(file_name):
                return {
                    "name": file_name[:-len('_reportAnalysis.json')],
                    "failedCount": len(self._loadJsonFile(os.path.join(report_path, file_name)).get('failedCases', []))
                }

            return sorted((create_local_item(link) for link in links), key=lambda item: item["name"].lower())

        report_path = "ReportAnalysis/author/" if view_type == "author" else "ReportAnalysis/"
        report_url = f'{self.reportUrl}{version}/{report_path}'
        try:
            response = requests.get(report_url, timeout=REQUEST_TIMEOUT_SECONDS)
            response.raise_for_status()
        except requests.RequestException:
            return []
        links = re.findall(r'<a\s+href="([^"]+_reportAnalysis\.json)"', response.text)

        def create_item(link):
            link = self._safeSegment(link)
            return {
                "name": link.split("_reportAnalysis.json")[0],
                "failedCount": self.getFailedScriptCount(report_url + link)
            }

        with ThreadPoolExecutor(max_workers=min(8, max(1, len(links)))) as executor:
            items = list(executor.map(create_item, links))
        return sorted(items, key=lambda item: item["name"].lower())

    def _loadJsonFile(self, file_path):
        with open(file_path, 'r', encoding='utf-8') as file_object:
            return json.load(file_object)

    def getVersionList(self, view_type):
        versions = self.getVersionEntries()
        return createTreeData(versions, view_type)

    def streamInitialData(self, view_type):
        def send_latest(version):
            print(json.dumps({
                "type": "latestVersion",
                "version": version,
                "viewType": view_type
            }), flush=True)

        versions = self.getVersionEntries(send_latest)
        print(json.dumps({
            "type": "treeData",
            "data": json.loads(createTreeData(versions, view_type)),
            "viewType": view_type
        }), flush=True)
    
    def handleSummaryData(self,version):
        version = self._safeSegment(version)
        if self.localRoot is not None:
            return json.dumps(self._loadLocalJson(version, 'reportSummary.json'), indent=4)
        summary_url = self.reportUrl + version + "/ReportAnalysis/reportSummary.json"
        response = requests.get(summary_url, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        return json.dumps(response.json(), indent=4)

    def handleAlwaysAndFlakyData(self,version):
        version = self._safeSegment(version)
        if self.localRoot is not None:
            return json.dumps({"filePath": self._analysisPath(version, 'casesHistory.json')}, indent=4)
        source_url = self.reportUrl + version + "/ReportAnalysis/casesHistory.json"
        file_path = self._downloadJson(source_url, version + "_reportPoorCasesData.json")
        return json.dumps({"filePath": file_path}, indent=4)
  

    def handleClosedDefectData(self,version):
        version = self._safeSegment(version)
        if self.localRoot is not None:
            return json.dumps({"filePath": self._analysisPath(version, 'closedDefectCases.json')}, indent=4)
        source_url = self.reportUrl + version + "/ReportAnalysis/closedDefectCases.json"
        file_path = self._downloadJson(source_url, version + "_closedDefectCases.json")
        return json.dumps({"filePath": file_path}, indent=4)
    
    
    def handleModuleData(self,versionString):
        version=versionString.split("|")[0]
        module = versionString.split("|")[1]
        version = self._safeSegment(version)
        module = self._safeSegment(module)
        if self.localRoot is not None:
            analysisFile = self._analysisPath(version, module+'_reportAnalysis.json')
            self._loadJsonFile(analysisFile)
            return json.dumps({"filePath": analysisFile}, indent=4)
        moduleUrl = f'{self.reportUrl}{version}/ReportAnalysis/{module}_reportAnalysis.json'
        analysisFile = self._downloadJson(moduleUrl, version+"_"+module+"_reportAnalysis.json")
        return json.dumps({"filePath": analysisFile}, indent=4)

    def handleAuthorData(self,versionString):
        version=versionString.split("|")[0]
        author = versionString.split("|")[1]
        version = self._safeSegment(version)
        author = self._safeSegment(author)
        if self.localRoot is not None:
            analysisFile = self._analysisPath(version, 'author', author+'_reportAnalysis.json')
            self._loadJsonFile(analysisFile)
            return json.dumps({"filePath": analysisFile}, indent=4)
        authorUrl = f'{self.reportUrl}{version}/ReportAnalysis/author/{author}_reportAnalysis.json'
        analysisFile = self._downloadJson(authorUrl, version+"_"+author+"_reportAnalysis.json")
        return json.dumps({"filePath": analysisFile}, indent=4)
                            

    def generate_history_lines(self,pass_rate_detail,history_list):
        history = "<div class='test-result-history__success-rate'>"+pass_rate_detail+"</div>"
        html_string = []
        html_line="<div class='history_line'>{}<span class='label label_status_{}'>{}</span><span class='history_reason'>{}</span></div>"
        html_line2="<div class='history_line'>{}<span class='label label_status_{}'>{}</span> </div>"
        index=0
        lengthmax =90
        for item in history_list:
            if index<15:
                if item['status'] == 'failed':
                    status = 'FAIL'
                    html_string.append(html_line.format(item['time'].split(' ')[0],item['status'],status,item['details']))
                    index = index+1 
                else:
                    status = 'PASS'
                    html_string.append(html_line2.format(item['time'].split(' ')[0],item['status'],status))
                    index = index+1                          
            else:
               break;
        return history+"".join(html_string)
                        
                        
class Generate_Html:
    def __init__(self, temp_html, work_dir):
        self.temp_html = temp_html
        self.work_dir = work_dir
        self.file_path = ""

    def find_filepath(self, work_dir, case_name):
        for dirpath, dirnames, filenames in os.walk(work_dir):
            for filename in filenames:
                if filename.endswith('.robot'):
                    if filename == case_name+".robot":
                       return os.path.join(dirpath, filename)

    def get_file_path(self, files, case_name):
        for file_name in files:
            if file_name.endswith('.robot') and file_name == case_name:
                return True
        return False

   

    def _generate_history_lines(self,pass_rate_detail,history_list):
        history = "<div class='test-result-history__success-rate'>"+pass_rate_detail+"</div>"
        html_string = []
        html_line="<span class='label label_status_{}'>{}</span> {} at {}<br/>"
        index=0
        for item in history_list:
            if index<15:
               html_string.append(html_line.format(item['status'],item['status'],item['time'].split(' ')[0],item['time'].split(' ')[1]))
               index = index+1
            else:
               break;
        return history+"".join(html_string)


def createVersionItemNodes(version, values, view_type):
    return [{
        "key": f"item:{view_type}:{version}:{value['name']}",
        "id": f"{version}|{value['name']}",
        "text": f"{value['name']} ({value.get('failedCount', 0)})",
        "nodeType": "reportItem"
    } for value in values]


def createTreeData(versions, view_type):
    version_nodes = []
    for version_entry in versions:
        version = version_entry["name"]
        items = [{
            "key": f"placeholder:{view_type}:{version}",
            "text": "Load report items...",
            "nodeType": "placeholder"
        }]
        version_nodes.append({
            "key": f"version:{version}",
            "text": version,
            "version": version,
            "nodeType": "version",
            "loaded": False,
            "expanded": False,
            "items": items
        })
    return json.dumps([{
        "key": "root",
        "text": "Report Version",
        "nodeType": "root",
        "expanded": True,
        "items": version_nodes
    }], indent=4)
    
def generate_analysis(report_url , version , module , html_temp_url,work_dir):
    module_url = report_url+version+"/Regression/"+module+"/"
    request_url = module_url+"analysis.json"
    content = requests.get(request_url, timeout=REQUEST_TIMEOUT_SECONDS).text
    #1.download analysis file
    # print('download file', datetime.datetime.now())
    analysis_file = os.path.join(os.path.abspath(os.sep), "Users", os.getlogin(),
                                        "Report Analysis", version+"_"+module+"_analysis.json")
    if not os.path.exists(analysis_file):
       with open(analysis_file, "w+") as fileobj:
            for item in content:
                fileobj.write(item)
    #2.generate html  
    # print('generate html', datetime.datetime.now())
    html_generator = Generate_Html(html_temp_url, work_dir[1:])
    html_generator._create_html(module+"["+version+"]",analysis_file,module_url)
    sys.stdout.flush()

if __name__ == "__main__":
    method = sys.argv[1]
    report_url = sys.argv[2]
    if method=="getInitialData":
        try:
            GetReport(report_url).streamInitialData(sys.argv[3])
        except Exception as e:
            print(json.dumps({"type": "error", "message": str(e)}), flush=True)
    elif method=="getVersionList":
        try:
            versionList = GetReport(report_url).getVersionList(sys.argv[3])
            print(versionList)
            sys.stdout.flush()
        except Exception as e:
            print(e)
    elif method=="getVersionItems":
        try:
            version = sys.argv[3]
            view_type = sys.argv[4]
            items = GetReport(report_url).getVersionItems(version, view_type)
            print(json.dumps({
                "version": version,
                "viewType": view_type,
                "items": createVersionItemNodes(version, items, view_type)
            }, indent=4))
            sys.stdout.flush()
        except Exception as e:
            print(e)
    elif method=="generate":
        try:
            print('start', datetime.datetime.now())
            generate_analysis(report_url,sys.argv[3],sys.argv[4],sys.argv[5],sys.argv[6])
            print('end', datetime.datetime.now())
        except Exception as e:
            print(e)
    elif method=="getSummaryData":
        try:
            summaryData =  GetReport(report_url).handleSummaryData(sys.argv[3])
            print(summaryData)
            sys.stdout.flush()
        except Exception as e:
            print(e)    
    elif method=="getModuleData":
        try:
            moduleData = GetReport(report_url).handleModuleData(sys.argv[3])
            print(moduleData)
            sys.stdout.flush()
        except Exception as e:
            print(e)  
    elif method=="getAuthorData":
        try:
            authorData = GetReport(report_url).handleAuthorData(sys.argv[3])
            print(authorData)
            sys.stdout.flush()
        except Exception as e:
            print(e)  
    elif method == "getClosedDefectData":
        try:
            moduleData = GetReport(report_url).handleClosedDefectData(sys.argv[3])
            print(moduleData)
            sys.stdout.flush()
        except Exception as e:
            print(e)  
    elif method=="getPoorCasesData":
        try:
            poorData = GetReport(report_url).handleAlwaysAndFlakyData(sys.argv[3])
            print(poorData)
            sys.stdout.flush()
        except Exception as e:
            print(e)