
const vscode = acquireVsCodeApi();
window.vscode = vscode;

$(document).ready(function () {
    document.querySelectorAll('[data-tab-target]').forEach(function(tab) {
        tab.addEventListener('click', function(event) {
            changeTab(event, tab.dataset.tabTarget);
        });
    });

    let treeData = [];
    let currentVersion = "";
    const pendingVersionItems = new Set();
    const poorDataByVersion = new Map();
    const closedDefectDataByVersion = new Map();
    const pendingTabData = new Set();
    const pendingOverviewVersions = new Set();
    let overviewRenderId = 0;
    let loadingOverviewRenderId = null;

    const viewSelector = $("#viewSelector").dxSelectBox({
        items: [{
            id: "module",
            text: "By Module"
        }, {
            id: "author",
            text: "By Author"
        }],
        valueExpr: "id",
        displayExpr: "text",
        value: "author",
        onValueChanged: function(e) {
            loadPanel.show();
            treeData = [];
            setCurrentVersion("");
            pendingVersionItems.clear();
            vscode.postMessage({
                command: 'Inital',
                viewType: e.value
            });
        }
    }).dxSelectBox('instance');

    vscode.postMessage({
        command: 'Inital',
        viewType: 'author'
    });
    window.addEventListener("message", event => {
        const message = event.data;
        if (message.type === 'summaryData') {
            pendingOverviewVersions.delete(message.version);
            if (message.version === currentVersion) {
                loadSummary(message.data);
            }
        }
        if (message.type === 'latestVersion') {
            if (message.viewType === viewSelector.option('value') && !currentVersion) {
                loadVersionOverview(message.version);
            }
        }
        else if (message.type === 'treeData') {
            if (message.viewType === viewSelector.option('value')) {
                loadTree(message.data);
            }
        }
        else if (message.type === 'versionItems') {
            loadVersionItems(message.data);
        }
        else if (message.type === 'moduleData') {
            loadPanel.hide();
            loadModule(message.data);
        }
        else if(message.type === 'closedDefectData'){
            pendingTabData.delete(`closed:${message.version}`);
            closedDefectDataByVersion.set(message.version, message.data);
            if (message.version === currentVersion) {
                loadPanel.hide();
                loadClosedDefectGrid(message.data);
            }
        }
        else if(message.type === 'poorData'){
            pendingTabData.delete(`poor:${message.version}`);
            poorDataByVersion.set(message.version, message.data);
            if (message.version === currentVersion) {
                loadPanel.hide();
                loadPoorCasesGrid(message.data);
            }
        }
    });
    const loadPanel = $('.loadpanel').dxLoadPanel({
        shadingColor: 'rgba(0,0,0,0.4)',
        position: { of: '#loading' },
        visible: false,
        showIndicator: true,
        showPane: true,
        shading: true,
        hideOnOutsideClick: false,
        onShown() {
          setTimeout(() => {
            loadPanel.hide();
          }, 90000);
        },
    }).dxLoadPanel('instance');
    loadPanel.show();

    function setCurrentVersion(version) {
        currentVersion = version;
        $("#overviewVersion").text(version || "--");
    }

    function loadVersionOverview(version, showLoading = true) {
        setCurrentVersion(version);
        if (pendingOverviewVersions.has(version)) {
            return;
        }
        overviewRenderId += 1;
        pendingOverviewVersions.add(version);
        if (showLoading) {
            loadingOverviewRenderId = overviewRenderId;
            loadPanel.show();
        }
        vscode.postMessage({
            command: 'version',
            versionString: currentVersion
        });
        setTimeout(() => pendingOverviewVersions.delete(version), 5000);
    }

    function loadTree(data) {
        treeData = data;
        const firstVersion = treeData[0] && treeData[0].items && treeData[0].items[0];
        if (!firstVersion) {
            treeView.option('dataSource', treeData);
            loadPanel.hide();
            return;
        }
        firstVersion.expanded = true;
        treeView.option('dataSource', treeData);
        treeView.expandItem('root');
        if (!currentVersion) {
            loadVersionOverview(firstVersion.version);
        }
        requestVersionItems(firstVersion, false);
        treeView.expandItem(firstVersion.key);
    }

    function loadVersionItems(result) {
        pendingVersionItems.delete(result.version);
        if (result.viewType !== viewSelector.option('value')) {
            return;
        }
        if (!treeData[0] || !Array.isArray(treeData[0].items)) {
            return;
        }
        const versionNode = treeData[0].items.find(item => item.version === result.version);
        if (!versionNode) {
            return;
        }
        versionNode.loading = false;
        versionNode.items = result.items;
        versionNode.loaded = true;
        versionNode.expanded = true;
        treeView.option('dataSource', treeData);
        treeView.expandItem('root');
        treeView.expandItem(versionNode.key);
        if (loadingOverviewRenderId === null) {
            loadPanel.hide();
        }
    }

    function requestVersionItems(versionNode, showLoading = true) {
        if (!versionNode || versionNode.loaded || pendingVersionItems.has(versionNode.version)) {
            return;
        }
        const viewType = viewSelector.option('value');
        const itemType = viewType === 'author' ? 'authors' : 'modules';
        pendingVersionItems.add(versionNode.version);
        versionNode.loading = true;
        versionNode.loadingLabel = `Loading ${itemType}`;
        treeView.option('dataSource', treeData);
        if (showLoading) {
            loadPanel.show();
        }
        vscode.postMessage({
            command: 'versionItems',
            versionString: versionNode.version,
            viewType: viewType
        });
    }

    window.requestVersionTabData = function(dataType) {
        if (!currentVersion) {
            return;
        }
        const cache = dataType === 'poor' ? poorDataByVersion : closedDefectDataByVersion;
        if (cache.has(currentVersion)) {
            if (dataType === 'poor') {
                loadPoorCasesGrid(cache.get(currentVersion));
            } else {
                loadClosedDefectGrid(cache.get(currentVersion));
            }
            return;
        }
        const requestKey = `${dataType}:${currentVersion}`;
        if (pendingTabData.has(requestKey)) {
            return;
        }
        pendingTabData.add(requestKey);
        loadPanel.show();
        vscode.postMessage({
            command: dataType === 'poor' ? 'poorData' : 'closedDefectData',
            versionString: currentVersion
        });
    };

    
    
    function loadSummary(data) {
        const renderId = overviewRenderId;
        const summaryPart = data["summary"];
        const pieData=[{"state":"Pass","number":summaryPart["pass"]},
        {"state":"Fail","number":summaryPart["fail"]},
        {"state":"Skip","number":summaryPart["skip"]}];
        $("#summaryPass").text(summaryPart["pass"]);
        $("#summaryFail").text(summaryPart["fail"]);
        $("#summarySkip").text(summaryPart["skip"]);
        $("#summaryTotal").text(summaryPart["total"]);
        const historyData = data["history"];
        const moduleData = data["modulelist"];
        renderOverviewComponent(renderId, summaryPie, 'drawn', pieData, function() {
            if (loadingOverviewRenderId === renderId) {
                loadingOverviewRenderId = null;
                loadPanel.hide();
            }
            renderOverviewComponent(renderId, executionHistory, 'drawn', historyData, function() {
                renderOverviewComponent(renderId, moduleGrid, 'contentReady', moduleData, function() {
                });
            });
        });
    }

    function renderOverviewComponent(renderId, component, eventName, dataSource, onRendered) {
        if (renderId !== overviewRenderId) {
            return;
        }
        let completed = false;
        const handleRendered = function() {
            if (completed) {
                return;
            }
            completed = true;
            component.off(eventName, handleRendered);
            requestAnimationFrame(function() {
                setTimeout(function() {
                    if (renderId === overviewRenderId) {
                        onRendered();
                    }
                }, 0);
            });
        };
        component.on(eventName, handleRendered);
        component.option('dataSource', dataSource);
    }

    function loadModule(data){
        var failedData = data["failedCases"];
        var defectData = data["defectedCases"];
        loadFailedGrid(failedData);
        loadDefectedGrid(defectData);
        // Update total count for failed cases
        const totalFailedCount = failedData ? failedData.length : 0;
        const totalDefectCount = defectData ? defectData.length : 0;
        $("#failedTable .count").text(totalFailedCount);
        $("#defectedTable .count").text(totalDefectCount);
        // Update table headers
        $("#failedTable .dx-header-row").show();
        $("#defectedTable .dx-header-row").show();
    }
    
    function loadForm(data){
        loadPanel.hide();
        var divId = "Form"+data["id"];
        var commentsId = "Comments"+data["id"];
        $('#'+divId).dxForm('instance').option('formData',data);
    }

    let failedGrid;
    let defectGrid;
    let poorCasesGrid;
    let defectCloseGrid;

    function loadFailedGrid(failedData){
        failedGrid = failedGrid || createFailedTable();
        failedGrid.option('dataSource', failedData);
        $("#failedTable .count").text(failedData ? failedData.length : 0);
        $("#failedTable .dx-header-row").show();
    }

    function loadDefectedGrid(defectedData){
        defectGrid = defectGrid || createDefectGrid();
        defectGrid.option('dataSource', defectedData);
    }

    
    function loadPoorCasesGrid(poorcasesData){
        poorCasesGrid = poorCasesGrid || createPoorGrid();
        poorCasesGrid.option('dataSource', poorcasesData);
    }

    // const closedDefectDataGrid = createDefectCloseGrid();
    function loadClosedDefectGrid(defectedData){
        defectCloseGrid = defectCloseGrid || createDefectCloseGrid();
        defectCloseGrid.option('dataSource', defectedData);
        $("#defectClosedTable .count").text(defectedData ? defectedData.length : 0);
        $("#defectClosedTable .dx-header-row").show();
    }

    function selectVersion(item) {
        loadVersionOverview(item.version);
        requestVersionItems(item);
        $('#summary').show();
        $('#detailTable').hide();
        document.getElementById('general_Tab').click();
    }

    var treeView = $("#treeview").dxTreeView({
        keyExpr: 'key',
        searchEnabled: true,
        itemTemplate: function(item) {
            const content = $('<div>').addClass('tree-node-content');
            if (item.loading) {
                content.append(
                    $('<span>')
                        .addClass('tree-node-spinner')
                        .attr('title', item.loadingLabel)
                        .attr('aria-label', item.loadingLabel)
                );
            }
            content.append($('<span>').text(item.text));
            return content;
        },
        onItemExpanded: function(e) {
            if (e.itemData.nodeType === 'version') {
                selectVersion(e.itemData);
            }
        },
        onItemClick: function (e) {
            const item = e.itemData;
            if (item.nodeType === 'placeholder') {
                requestVersionItems(e.node.parent.itemData);
            } else if (item.nodeType === 'reportItem') {
                $('#summary').hide();
                $('#detailTable').show();
                document.getElementById('failed_Tab').click();
                $("#failedTable .count").text("---");
                loadPanel.show();
                const currentView = viewSelector.option('value');
                if(currentView === 'author') {
                    vscode.postMessage({
                        command: 'author',
                        authorString: item.id
                    });
                } else {
                    vscode.postMessage({
                        command: 'module',
                        moduleString: item.id
                    });
                }
            } else if (item.nodeType === 'version') {
                selectVersion(item);
            }
        },
    }).dxTreeView("instance");

    const summaryPie = $("#summaryPie").dxPieChart({
        animation: {
            enabled: false,
        },
        innerRadius: 0.7,
        resolveLabelOverlapping: 'shift',
        sizeGroup: 'piesGroup',
        margin: {
            top: 40,
            right: 180,
        },
        type: 'doughnut',
        series: [{
            argumentField: "state",
            valueField: "number",
            label: {
                visible: true,
                connector: {
                    visible: true,
                    width: 1
                },
                format: 'fixedPoint',
                backgroundColor: 'none',
                customizeText(e) {
                    return `${e.argumentText}: ${(e.percent * 100).toFixed(2)}%`;
                },
            }
        }],
        legend: { visible: false },
        palette: ["#97cc64", "#fd5a3e", "#aaa"] // replace with desired color values
    }).dxPieChart('instance');

    const gridSettings = {
        showBorders: true,
        remoteOperations: false,
        searchPanel: {
            visible: true,
            highlightCaseSensitive: true,
        },
        title: {
            text: "Module Details",
            font: {
                size: 18,
                weight: 500
            },
            horizontalAlignment: "center"
        },
        height: '98%',
        width: '98%',
        allowColumnReordering: true,
        rowAlternationEnabled: true,
    };

    const discountCellTemplate = function (container, options) {
        $('<div/>').dxBullet({
            onIncidentOccurred: null,
            //   size: {
            //     width: 150,
            //     height: 35,
            //   },
            margin: {
                top: 5,
                bottom: 0,
                left: 5,
            },
            showTarget: false,
            showZeroLevel: true,
            value: options.value * 100,
            startScaleValue: 0,
            endScaleValue: 100,
            tooltip: {
                enabled: true,
                font: {
                    size: 18,
                },
                paddingTopBottom: 2,
                customizeTooltip() {
                    return { text: options.text };
                },
                zIndex: 5,
            },
        }).appendTo(container);
    };
    
    
    const moduleGrid =  $('#moduleGrid').dxDataGrid({
        showBorders: true,
        remoteOperations: false,
        title: {
            text: "Module Details",
            font: {
                size: 18,
                weight: 500
            },
            horizontalAlignment: "center"
        },
        height: '98%',
        width: '98%',
        allowColumnReordering: true,
        rowAlternationEnabled: true,
        columns: [
            { dataField: "module", caption: "Module", alignment: 'center', width: '34%' },
            { dataField: "total", caption: "Total", alignment: 'center', width: '11%' },
            { dataField: "pass", caption: "Pass", alignment: 'center', width: '11%' },
            { dataField: "fail", caption: "Fail", alignment: 'center', width: '11%' },
            { dataField: "skip", caption: "Skip", alignment: 'center', width: '11%' },
            {
                dataField: "passrate", caption: "Pass Rate", sortOrder: 'desc',
                alignment: 'center', width: '22%', customizeText: (options) => {
                    return options.valueText+"%";
                }
            }
        ]
    }).dxDataGrid('instance');
    
    const executionHistory = $("#executionHistory").dxChart({
        animation: {
            enabled: false,
        },
        commonSeriesSettings: {
            argumentField: 'version',
            type: 'stackedBar',
        },
        title: {
            text: "Execution History",
            font: {
                size: 18,
                weight: 500
            },
            horizontalAlignment: "center"
        },
        series: [
            { valueField: "pass", name: "Pass", },
            { valueField: "fail", name: "Fail", },
            { valueField: "skip", name: "Skip", },
            {
                axis: 'rate',
                type: 'spline',
                
                valueField: 'passrate',
                name: 'Rate',
                color: '#008fd8',
            },
        ],
        valueAxis: [{
            grid: {
                visible: true,
            },
        }, {
            name: 'rate',
            position: 'right',
            grid: {
                visible: true,
            },label: {
                customizeText() {
                  return `${this.valueText}%`;
                },
              },
            title: {
                text: 'Pass Rate',
            },
        }],

        legend: {
            verticalAlignment: 'bottom',
            horizontalAlignment: 'center',
        },
        palette: ["#97cc64", "#fd5a3e", "#aaa"],
        tooltip: {
            enabled: true,
            shared: true,
            customizeTooltip(arg) {
                const items = arg.valueText.split('\n');
                const color = arg.point.getColor();
                $.each(items, (index, item) => {
                    if (item.indexOf(arg.seriesName) === 0) {
                        items[index] = $('<span>')
                            .text(item)
                            .addClass('active')
                            .css('color', color)
                            .css('text-align', 'left') // add this line to align text to left
                            .prop('outerHTML');
                    }
                });
                new_items = $('<p>').css('text-align', 'left').text(arg.argumentText + ('\n')).prop('outerHTML');
                return { text: new_items + items.join('\n') };
            },
        },
    }).dxChart('instance');
    
    
   
});

function changeTab(event, tabId) {
    // Get all tab containers
    var tabContainers = document.getElementsByClassName("table-container");

    // Remove 'active' class from all tabs
    for (var i = 0; i < tabContainers.length; i++) {
        tabContainers[i].classList.remove("active");
    }

    // Add 'active' class to the selected tab
    var selectedTab = document.getElementById(tabId);
    selectedTab.classList.add("active");

    // Remove 'active' class from all tabs
    var tabs = document.getElementsByClassName("tab");
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove("active");
    }

    // Add 'active' class to the clicked tab
    event.target.classList.add("active");

    if (tabId === 'tabPoorCases' && window.requestVersionTabData) {
        window.requestVersionTabData('poor');
    } else if (tabId === 'tabDefectClosedCases' && window.requestVersionTabData) {
        window.requestVersionTabData('closed');
    }
}

function generateHistoryLines(passRateDetail, historyList) {  
    const container = $('<div>');
    if(passRateDetail!==""){
        container.append($('<div>').addClass('test-result-history__success-rate').text(passRateDetail));
    }
    let index = 0;  
  
    for (let item of historyList) {  
        let date = String(item.time || '').split(' ')[0];
        if (index < 15) {  
            const line = $('<div>').addClass('history_line').text(date);
            const status = String(item.status || '');
            line.append($('<span>').addClass('label label_status_' + status).text(getStatus(status)));
            if (item.status === 'failed') {  
                line.append($('<span>').addClass('history_reason').text(item.details || ''));
            }
            container.append(line);
            index++;
        } else {  
            break;  
        }  
    }  
  
    return container.contents();
}  

function getStatus(status) {  
    switch (status) {  
        case 'failed': return 'FAIL';  
        case 'skipped': return 'SKIP';  
        default: return 'PASS';  
    }  
}
