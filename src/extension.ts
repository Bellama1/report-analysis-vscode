'use strict';
import { ExtensionContext, window, TextDocument, Disposable, Selection, WebviewPanel, workspace, Uri, commands, ViewColumn, ProgressLocation, CancellationToken, Progress, DebugConsoleMode, CommentThreadCollapsibleState, TreeItemCollapsibleState, TaskPanelKind, DocumentDropEdit, TextEditorCursorStyle, TextEditorLineNumbersStyle, TextEditorRevealType, TextEditor, DocumentHighlight, Range, DocumentHighlightKind, DocumentLink, Position, DocumentSymbol, FileStat, FileSystem, FileSystemError, FileSystemProvider, TestMessage } from 'vscode';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import * as readline from 'readline';
import { AiFixCaseEvidence, AiFixProvider, CopilotChatAiFixProvider } from './ai/reportAnalysisAi';
const path = require('path');
const fs = require('fs');


class ReportAnalysisPanel {
    public static currentPanel: ReportAnalysisPanel | undefined;

    public static readonly viewType = 'webview';

    private readonly _panel: WebviewPanel;
    private readonly _extensionPath: String;
    private _currentAnalysisJsonPath: string | undefined;
    private readonly _aiFixProvider: AiFixProvider = new CopilotChatAiFixProvider();
    private _disposables: Disposable[] = [];

    public static getViewContent(extensionPath: String, templatePath: string, panel: WebviewPanel) {
        const resourcePath = path.join(extensionPath, templatePath);
        const dirPath = path.dirname(resourcePath);
        const aiFixImageUri = panel.webview.asWebviewUri(
            Uri.file(path.join(extensionPath, 'web', 'images', 'ai-fix-robot.svg'))
        );
        const nonce = randomBytes(16).toString('base64');
        let html = fs.readFileSync(resourcePath, 'utf-8');
        html = html.replace(/(<link.+?href="|<script.+?src="|<iframe.+?src="|<img.+?src=")(.+?)"/g, (m: string, $1: string, $2: string) => {
            return $1 + panel.webview.asWebviewUri(Uri.file(path.join(dirPath, $2))) + '"';
        });
        html = html.replace('${base64Image}', aiFixImageUri.toString());
        html = html.replace(/\$\{nonce\}/g, nonce);
        html = html.replace(/\$\{cspSource\}/g, panel.webview.cspSource);
        return html;
    }

    public static createOrShow(extensionPath: string, htmlPath: string) {
        const column = window.activeTextEditor ? window.activeTextEditor.viewColumn : undefined;
        const localReportRoot = this.getLocalReportRoot();
        let panel: WebviewPanel | undefined = undefined;
        // If we already have a panel, show it.
        if (ReportAnalysisPanel.currentPanel) {
            ReportAnalysisPanel.currentPanel._panel.reveal(column);
            panel = ReportAnalysisPanel.currentPanel._panel;
        } else {
            // Otherwise, create a new panel.
            panel = window.createWebviewPanel(
                'webview',
                "Report Analysis",
                ViewColumn.One,
                {
                    localResourceRoots: [
                        Uri.file(path.join(extensionPath, 'web')),
                        Uri.file(path.join(extensionPath, 'python')),
                        ...(localReportRoot ? [Uri.file(localReportRoot)] : []),
                    ],
                    enableScripts: true,
                    enableFindWidget: true,
                    retainContextWhenHidden: true
                });

            panel.webview.asWebviewUri(Uri.file(path.join(__dirname, htmlPath)));
            ReportAnalysisPanel.currentPanel = new ReportAnalysisPanel(panel, extensionPath);
            ReportAnalysisPanel.currentPanel._panel.webview.html = this.getViewContent(extensionPath, htmlPath, ReportAnalysisPanel.currentPanel._panel);
        }
        return panel;
    }

    private static getLocalReportRoot(): string | undefined {
        const configuration = workspace.getConfiguration();
        const source = configuration.get<string>('reportAnalysis.reportSource') || '';
        if (!source || /^https?:\/\//i.test(source)) {
            return undefined;
        }
        if (/^file:\/\//i.test(source)) {
            return Uri.parse(source).fsPath;
        }
        return path.resolve(source);
    }

    private constructor(panel: WebviewPanel, extensionPath: String) {
        this._panel = panel;
        this._extensionPath = extensionPath;
        // this._update();  //blank page at first
        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'Inital':
                    this.getTreeData(extensionPath, message.viewType || 'module');
                    break;
                case 'versionItems':
                    this.getVersionItems(extensionPath, message.versionString, message.viewType || 'module');
                    break;
                case 'findKwLine':
                    this.openFileAndJumpToKeyword(message);
                    break;
                case 'version':
                    this.loadSummayData(message, extensionPath);
                    break;
                case 'closedDefectData':
                    this.loadClosedDefectData(message, extensionPath);
                    break;
                case 'poorData':
                    this.loadPoorData(message, extensionPath);
                    break;
                case 'module':
                    this.loadModuleData(message, extensionPath);
                    break;  
                case 'author':
                    this.loadAuthorData(message, extensionPath);
                    break;
                case 'aiFixFailedCases':
                    this.openCopilotAiFix(message);
                    break;
                case 'aiFixAllFailedCases':
                    this.openCopilotAiFixAll(message);
                    break;
            }
        }, null, this._disposables);
    }

    private getTreeData(extensionPath: String, viewType: string = 'module') {
        return new Promise<void>((resolve) => {
            let script = path.join(extensionPath, 'python/reportAnalysis.py');
            const reportUrl = this.getReportSource();
            let childProcess = spawn(this.getPythonPath(), [script, "getInitialData", reportUrl, viewType]);
            let receivedTree = false;
            const output = readline.createInterface({ input: childProcess.stdout });
            output.on('line', line => {
                try {
                    const result = JSON.parse(line);
                    if (result.type === 'latestVersion') {
                        ReportAnalysisPanel.currentPanel?._panel.webview.postMessage(result);
                    } else if (result.type === 'treeData') {
                        receivedTree = true;
                        ReportAnalysisPanel.currentPanel?._panel.webview.postMessage(result);
                    } else if (result.type === 'error') {
                        window.showErrorMessage(result.message);
                    }
                } catch (error) {
                    window.showErrorMessage('Get Version List returned invalid data');
                }
            });
            childProcess.on('close', () => {
                if (!receivedTree) {
                    window.showErrorMessage('Get Version List Failed, Please try again');
                }
                resolve();
            });
            childProcess.on('error', error => {
                window.showErrorMessage(this.formatPythonError(error));
                resolve();
            });
            childProcess.stderr.on('data', (data: object) => {
                window.showErrorMessage(data.toString());
            });
        });
    }

    private async getVersionItems(extensionPath: String, version: string, viewType: string): Promise<void> {
        try {
            const output = await this.runReportCommand(extensionPath, ["getVersionItems", this.getReportSource(), version, viewType]);
            const result = JSON.parse(output);
            ReportAnalysisPanel.currentPanel?._panel.webview.postMessage({ type: 'versionItems', data: result });
        } catch (error) {
            window.showErrorMessage(`Get ${viewType} list for ${version} failed: ${this.getErrorMessage(error)}`);
        }
    }

    public static revive(panel: WebviewPanel, extensionPath: String, htmlPath: string) {
        const localReportRoot = this.getLocalReportRoot();
        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                Uri.file(path.join(extensionPath, 'web')),
                Uri.file(path.join(extensionPath, 'python')),
                ...(localReportRoot ? [Uri.file(localReportRoot)] : []),
            ],
        };
        ReportAnalysisPanel.currentPanel = new ReportAnalysisPanel(panel, extensionPath);
        ReportAnalysisPanel.currentPanel._panel.webview.html = this.getViewContent(extensionPath, htmlPath, ReportAnalysisPanel.currentPanel._panel);
    }

    private loadModuleData(message: any, extensionPath: String) {
        // console.log("call load module data");
        console.log("module:" + message.moduleString);
        this._getModuleData(message.moduleString, extensionPath);
    }

    private loadSummayData(message: any, extensionPath: String) {
        // console.log("call load summary data");
        console.log("version:" + message.versionString);
        this._getSummaryData(message.versionString, extensionPath);
    }

    private loadClosedDefectData(message: any, extensionPath: String) {
        // console.log("call load summary data");
        console.log("closed:" + message.versionString);
        this._getClosedDefectData(message.versionString, extensionPath);
    }

    private _getClosedDefectData(version: string, extensionPath: String): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let script = path.join(extensionPath, 'python/reportAnalysis.py');
            let reportUrl = this.getReportSource();
            let childProcess = spawn(this.getPythonPath(), [script, "getClosedDefectData", reportUrl, version]);
            childProcess.on('error', error => {
                window.showErrorMessage(this.formatPythonError(error));
                reject(error);
            });
            childProcess.stdout.on('data', function (res: object) {
                if (res.toString() == '') {
                    window.showErrorMessage('Get Closed Defect Data Failed, Please try again');
                    // reject('Get Module Data Failed');
                } else {
                    let filePath= JSON.parse(res.toString()).filePath;
                    fs.readFile(filePath, 'utf8', (err:Error, data:string) => {
                        const jsonData = JSON.parse(data);
                        ReportAnalysisPanel.currentPanel?._panel.webview.postMessage({ type: 'closedDefectData', version: version, data: jsonData["closedDefectCases"] });
                    });
                    resolve();
                };
            });
            childProcess.stderr.on('data', (data: object) => {
                window.showErrorMessage(data.toString());
            });
        });
    }

    private loadPoorData(message: any, extensionPath: String) {
        // console.log("call load poor data");
        console.log("version:" + message.versionString);
        this._getPoorCasesData(message.versionString, extensionPath);
    }

    private loadAuthorData(message: any, extensionPath: String) {
        console.log("author:" + message.authorString);
        this._getAuthorData(message.authorString, extensionPath);
    }

    private _getAuthorData(author: string, extensionPath: String): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let script = path.join(extensionPath, 'python/reportAnalysis.py');
            let reportUrl = this.getReportSource();
            let childProcess = spawn(this.getPythonPath(), [script, "getAuthorData", reportUrl, author]);
            childProcess.on('error', error => {
                window.showErrorMessage(this.formatPythonError(error));
                reject(error);
            });
            childProcess.stdout.on('data', function (res: object) {
                if (res.toString() == '') {
                    window.showErrorMessage('Get Author Data Failed, Please try again');
                } else {                   
                    try {
                        let filePath= JSON.parse(res.toString()).filePath;
                        ReportAnalysisPanel.currentPanel!._currentAnalysisJsonPath = filePath;
                        fs.readFile(filePath, 'utf8', (err:Error, data:string) => {
                            const jsonData = JSON.parse(data);
                            const failedData = jsonData.failedCases;
                            for (const item of failedData) {  
                                item.rawErrorPic = item.errorPic;
                                item.errorPic = ReportAnalysisPanel.currentPanel?.getReportAssetLocation(item.errorPic) || '';
                            } 
                            jsonData.failedCases = failedData;
                            ReportAnalysisPanel.currentPanel?._panel.webview.postMessage({ type: 'moduleData', data: jsonData });
                        });
                    } catch (error) {
                        window.showErrorMessage('Get Author Data Failed');
                        resolve();
                    }
                };
                resolve();
            });
            childProcess.stderr.on('data', (data: object) => {
                window.showErrorMessage(data.toString());
                reject('Get Author Data Failed');
                resolve();
            });
        });
    }

    private _getModuleData(version: string, extensionPath: String): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let script = path.join(extensionPath, 'python/reportAnalysis.py');
            let reportUrl = this.getReportSource();
            let childProcess = spawn(this.getPythonPath(), [script, "getModuleData", reportUrl, version]);
            childProcess.on('error', error => {
                window.showErrorMessage(this.formatPythonError(error));
                reject(error);
            });
            childProcess.stdout.on('data', function (res: object) {
                if (res.toString() == '') {
                    window.showErrorMessage('Get Module Data Failed, Please try again');
                    // reject('Get Module Data Failed');
                } else {                   
                    try {
                        let filePath= JSON.parse(res.toString()).filePath;
                        ReportAnalysisPanel.currentPanel!._currentAnalysisJsonPath = filePath;
                        fs.readFile(filePath, 'utf8', (err:Error, data:string) => {
                            const jsonData = JSON.parse(data);
                            const failedData = jsonData.failedCases;
                            for (const item of failedData) {  
                                item.rawErrorPic = item.errorPic;
                                item.errorPic = ReportAnalysisPanel.currentPanel?.getReportAssetLocation(item.errorPic) || '';
                            } 
                            jsonData.failedCases = failedData;
                            ReportAnalysisPanel.currentPanel?._panel.webview.postMessage({ type: 'moduleData', data: jsonData });
                        });
                    } catch (error) {
                        window.showErrorMessage('Get Module Data Failed');
                        resolve();
                    }
                };
                resolve();
            });
            childProcess.stderr.on('data', (data: object) => {
                window.showErrorMessage(data.toString());
                reject('Get Module Data Failed'); // Reject the promise here
                resolve();
            });
        });
    }


    

    private _getPoorCasesData(version: string, extensionPath: String): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let script = path.join(extensionPath, 'python/reportAnalysis.py');
            let reportUrl = this.getReportSource();
            let childProcess = spawn(this.getPythonPath(), [script, "getPoorCasesData", reportUrl, version]);
            childProcess.on('error', error => {
                window.showErrorMessage(this.formatPythonError(error));
                reject(error);
            });
            childProcess.stdout.on('data', function (res: object) {
                if (res.toString() == '') {
                    window.showErrorMessage('Get getPoorCases Data Failed, Please try again');
                } else {
                    let filePath= JSON.parse(res.toString()).filePath;
                    fs.readFile(filePath, 'utf8', (err:Error, data:string) => {
                        const jsonData = JSON.parse(data); 
                        let poorCaseData = [];
                        let alwaysfailedData = jsonData.alwaysFailCases;
                        let flakyData = jsonData.flakyCases;
                        for (const item of alwaysfailedData) {  
                            item.type = "Always Failed Cases";  
                            poorCaseData.push(item);  
                        }  
                        
                        for (const item of flakyData) {  
                            item.type = "Flaky Cases";  
                            poorCaseData.push(item);  
                        }   
                        ReportAnalysisPanel.currentPanel?._panel.webview.postMessage({ type: 'poorData', version: version, data: poorCaseData });
                        resolve();  
                    }); 

                };
            });
            childProcess.stderr.on('data', (data: object) => {
                window.showErrorMessage(data.toString());
                // reject('Get Module Data Failed'); // Reject the promise here
            });
        });
    }

    private _getSummaryData(moduleString: string, extensionPath: String): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let script = path.join(extensionPath, 'python/reportAnalysis.py');
            let reportUrl = this.getReportSource();
            let childProcess = spawn(this.getPythonPath(), [script, "getSummaryData", reportUrl, moduleString]);
            childProcess.on('error', error => {
                window.showErrorMessage(this.formatPythonError(error));
                reject(error);
            });
            childProcess.stdout.on('data', function (res: object) {
                if (res.toString() == '') {
                    window.showErrorMessage('Get Summary Data Failed, Please try again');
                    reject('Get Summary Data Failed');
                } else {
                    const summaryData = JSON.parse(res.toString());
                    ReportAnalysisPanel.currentPanel?._panel.webview.postMessage({ type: 'summaryData', version: moduleString, data: summaryData });
                    resolve();
                };
            });
            childProcess.stderr.on('data', (data: object) => {
                window.showErrorMessage(data.toString());
                reject('Get Summary Data Failed');
            });
        });
    }

    private async openCopilotAiFix(message: any): Promise<void> {
        const jsonPath = this._currentAnalysisJsonPath || 'the current report analysis JSON file loaded in Report Analysis';
        await this._aiFixProvider.run({
            analysisJsonPath: jsonPath,
            screenshotPrefix: this.getSelfHealScreenshotPrefix(),
            mode: 'single',
            continueAutomatically: true,
            cases: [this.toAiFixCaseEvidence(message)]
        });
    }

    private async openCopilotAiFixAll(message: any): Promise<void> {
        const failedCases = Array.isArray(message?.failedCases) ? message.failedCases : [];
        const autoMode = !!message?.autoMode;
        if (!failedCases.length) {
            window.showInformationMessage('No failed cases available for AI FIX.');
            return;
        }

        const jsonPath = this._currentAnalysisJsonPath || 'the current report analysis JSON file loaded in Report Analysis';
        const maxCases = workspace.getConfiguration().get<number>('reportAnalysis.ai.maxCases', 20);
        const selectedCases = failedCases.slice(0, maxCases);
        await this._aiFixProvider.run({
            analysisJsonPath: jsonPath,
            screenshotPrefix: this.getSelfHealScreenshotPrefix(),
            mode: 'batch',
            continueAutomatically: autoMode,
            cases: selectedCases.map((item: any) => this.toAiFixCaseEvidence(item))
        });
        if (failedCases.length > maxCases) {
            window.showInformationMessage(`AI FIX started for first ${maxCases} failed cases. Re-run AI FIX for remaining cases.`);
        }
    }

    private toAiFixCaseEvidence(message: any): AiFixCaseEvidence {
        const errorPicture = String(message?.rawErrorPic || message?.errorPic || '');
        return {
            caseName: String(message?.caseName || ''),
            failedStep: String(message?.failedStep || ''),
            errorMessage: String(message?.errMsg || ''),
            errorPicture,
            screenshotUrl: this.getSelfHealScreenshotUrl(errorPicture),
            subfailed: message?.subfailed ?? null,
            history: message?.history ?? null
        };
    }

    private getSelfHealScreenshotUrl(errorPic: any): string {
        return this.getReportAssetLocation(errorPic, false);
    }

    private getReportAssetLocation(assetPath: any, forWebview = true): string {
        if (!assetPath) {
            return '';
        }
        const source = this.getReportSource();
        const rawPath = String(assetPath).trim();
        if (/^https?:\/\//i.test(rawPath)) {
            return rawPath;
        }
        if (/^https?:\/\//i.test(source)) {
            try {
                return new URL(rawPath.replace(/^\/+/, ''), source.replace(/\/?$/, '/')).toString();
            } catch (error) {
                return '';
            }
        }

        const localRoot = ReportAnalysisPanel.getLocalReportRoot();
        if (!localRoot) {
            return '';
        }
        const resolvedPath = path.resolve(localRoot, rawPath.replace(/^[\\/]+/, ''));
        const relativePath = path.relative(localRoot, resolvedPath);
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
            return '';
        }
        return forWebview
            ? this._panel.webview.asWebviewUri(Uri.file(resolvedPath)).toString()
            : resolvedPath;
    }

    private getSelfHealScreenshotPrefix(): string {
        const reportUrl = this.getReportSource();
        return reportUrl;
    }

    private getReportSource(): string {
        const configuration = workspace.getConfiguration();
        return configuration.get<string>('reportAnalysis.reportSource') || '';
    }

    private getPythonPath(): string {
        return workspace.getConfiguration().get<string>('reportAnalysis.pythonPath', 'python');
    }

    private runReportCommand(extensionPath: String, args: string[]): Promise<string> {
        const script = path.join(extensionPath, 'python/reportAnalysis.py');
        return new Promise<string>((resolve, reject) => {
            const childProcess = spawn(this.getPythonPath(), [script, ...args]);
            let stdout = '';
            let stderr = '';
            childProcess.stdout.on('data', data => stdout += data.toString());
            childProcess.stderr.on('data', data => stderr += data.toString());
            childProcess.on('error', error => reject(new Error(this.formatPythonError(error))));
            childProcess.on('close', code => {
                if (code !== 0) {
                    reject(new Error(stderr.trim() || `Report process exited with code ${code}.`));
                    return;
                }
                resolve(stdout.trim());
            });
        });
    }

    private formatPythonError(error: Error): string {
        return `Unable to start Python (${this.getPythonPath()}): ${error.message}. Configure reportAnalysis.pythonPath and install requests and lxml.`;
    }

    private getErrorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }

    private openFileAndJumpToKeyword(message: any) {
        let failedStep = message.kws;
        let occurrence = message.occurrence;
        let caseString = message.caseName.split("\n");
        let caseName = caseString[0];
        let workspaceFolders = workspace.workspaceFolders;
        let projectDir = "";
        if (workspaceFolders) {
            projectDir = workspaceFolders[0].uri.fsPath;
        }
        let subfailed = message.subfailed;
        let caseUri = this._findFileUri(projectDir, caseName);
        if(caseUri===''){
           window.showErrorMessage("File '"+ caseName+".robot' does not Exists!");
        }else{
            workspace.openTextDocument(Uri.file(caseUri)).then(doc => {
                if(subfailed===null || typeof subfailed === 'undefined' || subfailed===''){
                    const keywordPosition = this._findFailedStep(doc,message.kws,message.occurrence);
                    window.showTextDocument(doc, { selection: keywordPosition });
                }else{
                    const keywordPosition = this.findKeywordPosition(doc,failedStep, subfailed,occurrence);
                    window.showTextDocument(doc, { selection: keywordPosition });
                }
            });
        }
        
    }

    private findKeywordPosition(doc: TextDocument, stepName: string, failedKeyword: any, occurrence:number): Selection | undefined {
        let documentArray = doc.getText().split(/\r?\n/);
        let index = documentArray.findIndex(item => item === "*** Keywords ***");  
        //find line in keyword section
        if(index>0){
            return this._findFailedSubKeyword(doc, stepName, failedKeyword,index+1,occurrence);
        }else{//find line in test step section
            return this._findFailedStep(doc,stepName,occurrence);
        }
    }
    
    private _findFailedStep(doc: TextDocument, stepName: string,occurrence: number){
        if(stepName===""){
            return new Selection(0, 0, 0, 0);
        }
        var firstCharacter = stepName[0];
        if (stepName.endsWith(",")) {
            stepName = stepName.substring(0, stepName.length - 1);
        }
        let kwArray = stepName.split(",");
        let documentArray = doc.getText().split(/\r?\n/);
        let matchCount = 0;
        for (var line = 0; line < documentArray.length; line++) {
            var lineString = documentArray[line].replace(/(^\s*)|(\s*$)/g, "")
            var isMatch = this.ifLineMatch(lineString, kwArray);
            if (isMatch) {
                matchCount++;
                if (matchCount == occurrence) {
                    var firstCharcter = documentArray[line].toUpperCase().indexOf(firstCharacter.toUpperCase());
                    var length = documentArray[line].length;
                    return new Selection(line, firstCharcter, line, firstCharcter + length);
                }
            } 
        }
        return new Selection(0, 0, 0, 0);
    }

    private _findFailedSubKeyword(doc: TextDocument, stepName: string, failedKeyword: any,kwSectionIndex:number,faileStepOccur:number){
        stepName = stepName.slice(0, -1);  //remove last comma
        let documentArray = doc.getText().split(/\r?\n/);
        let kwArray = failedKeyword.failedkw.replaceAll(":",",").split(",");
        var firstCharacter = (failedKeyword.failedkw)[0];
        let occurrence = failedKeyword.occurence;
        let matchCount = 0;
        for (let line = kwSectionIndex; line < documentArray.length; line++) {
            let text = documentArray[line].replace(/(^\s*)|(\s*$)/g, "");
            if(text.toLowerCase().startsWith("step")){
                console.log(text);
                var kwLower = text.toLowerCase();
                var stepLower = stepName.toLowerCase();
                var keywordArray = text.split("Step ${step}");
                if(stepLower===kwLower || stepName.endsWith(keywordArray[1])){
                    //find keyword line and find failed step
                    line++;
                    let nextline = documentArray[line].replace(/(^\s*)|(\s*$)/g, "");
                    //if next keyword not started and it's not the last line of document
                    while(!nextline.toLowerCase().startsWith("step ${step}") && line!=documentArray.length-1){
                        //if step is matched
                        if(this.ifLineMatch(nextline,kwArray)){
                            matchCount++;
                            //if occurrence is matched
                            if (matchCount === occurrence) {
                                var firstCharcter = documentArray[line].toUpperCase().indexOf(firstCharacter.toUpperCase());
                                var length = documentArray[line].length;
                                //return step location
                                return new Selection(line, firstCharcter, line, firstCharcter + length);
                            }
                        }
                        line++;
                        nextline = documentArray[line].replace(/(^\s*)|(\s*$)/g, "");
                    }        
                    return new Selection(line-1, 0, line-1, documentArray[line-1].length);
                }
            }
        }
        this._findFailedStep(doc,stepName,faileStepOccur);
    }

    public _findFileUri(pathName: string, caseName: string) {
        var files = fs.readdirSync(pathName);
        var caseUri = "";
        for (var item = 0; item < files.length; item++) {
            let stat = fs.lstatSync(path.join(pathName, files[item]));
            if (stat.isDirectory()) {
                caseUri = this._findFileUri(path.join(pathName, files[item]), caseName);
                if (caseUri == "") {
                    continue;
                } else {
                    return caseUri;
                }
            } else if (stat.isFile()) {
                if (files[item] === caseName + ".robot") {
                    // console.log("find you" + files[item]);
                    caseUri = path.join(pathName, files[item]);
                    return caseUri;
                } else {
                    continue;
                }
            }
        }
        return caseUri;
    }

    public ifLineMatch(lineString: string, kwArray: Array<string>) {
        if (lineString.toUpperCase().startsWith(kwArray[0].toUpperCase()) == false || lineString.toUpperCase().endsWith(kwArray[kwArray.length - 1].toUpperCase()) == false)
            return false;
        for (var arg = 0; arg < kwArray.length; arg++){
            if (lineString.toUpperCase().indexOf(kwArray[arg].toUpperCase()) == -1) {
                return false;
            }
        }
        return true;
    }

    public _update() {
        this._panel.webview.html = this._getViewContent('web/webview/index.html', this._panel);
    }

    public _getViewContent(templatePath: string, panel: WebviewPanel) {
        return ReportAnalysisPanel.getViewContent(this._extensionPath, templatePath, panel);
    }


    public dispose() {
        ReportAnalysisPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}

export function activate(context: ExtensionContext) {
    const extensionPath = context.extensionPath;
    context.subscriptions.push(commands.registerCommand('report-analysis.open', async () => {
        const reportPanel = ReportAnalysisPanel.createOrShow(extensionPath, 'web/webview/index.html');
    })
    );

    if (window.registerWebviewPanelSerializer) {
        // Make sure we register a serializer in activation event
        window.registerWebviewPanelSerializer(ReportAnalysisPanel.viewType, {
            async deserializeWebviewPanel(webviewPanel: WebviewPanel, state: any) {
                console.log(`Got state: ${state}`);
                // Reset the webview options so we use latest uri for `localResourceRoots`.
                ReportAnalysisPanel.revive(webviewPanel, extensionPath, 'web/webview/index.html');
            }
        });
    }
}
