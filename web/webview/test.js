let treeView;

$(function () {
    const vscode = acquireVsCodeApi();

    const selectBox = $('#selectBox').dxSelectBox({
        items: ['By Module', 'By Author'],
        value: 'By Module',
        onValueChanged: function (data) {
            const selectedOption = data.value;
            if (selectedOption === 'By Author') {
                vscode.postMessage({ command: 'Inital', isAuthor: true });
            } else {
                vscode.postMessage({ command: 'Inital', isAuthor: false });
            }
        },
    }).dxSelectBox('instance');

    const loadPanel = $('#loadPanel').dxLoadPanel({
        shadingColor: 'rgba(0,0,0,0.4)',
        position: { of: '#scrollView' },
        visible: true,
        showIndicator: true,
        showPane: true,
        shading: true,
        closeOnOutsideClick: false,
        onShown: function () {
            setTimeout(() => loadPanel.hide(), 90000);
        },
    }).dxLoadPanel('instance');

    treeView = $('#treeview').dxTreeView({
        dataStructure: 'plain',
        width: 300,
        height: '100%',
        keyExpr: 'ID',
        parentIdExpr: 'parentId',
        displayExpr: 'name',
        selectionMode: 'single',
        onItemClick: function (e) {
            const itemData = e.itemData;
            const selectedOption = selectBox.option('value');
            if (selectedOption === 'By Author') {
                vscode.postMessage({ command: 'versionByAuthor', versionString: itemData.text });
            } else {
                vscode.postMessage({ command: 'version', versionString: itemData.text });
            }
        },
    }).dxTreeView('instance');

    const scrollView = $('#scrollView').dxScrollView({
        width: '100%',
        height: '100%',
        scrollByContent: true,
    }).dxScrollView('instance');

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'summaryData':
                loadPanel.hide();
                loadSummary(message.data);
                break;
            case 'treeData':
                loadTree(message.data);
                break;
            case 'moduleData':
                loadModuleTable(message.data);
                break;
            case 'lineChartData':
                loadLineChart(message.data);
                break;
            case 'poorCasesData':
                loadPoorCases(message.data);
                break;
            default:
                console.warn("Unknown message type:", message.type);
        }
    });

    function loadTree(data) {
        if (!treeView) {
            setTimeout(() => loadTree(data), 100);
            return;
        }

        loadPanel.hide();
        treeView.option('dataSource', data);

        const nodes = treeView.getNodes();
        if (nodes.length > 0 && nodes[0].children && nodes[0].children.length > 0) {
            const firstNodeText = nodes[0].children[0].text;
            vscode.postMessage({ command: 'version', versionString: firstNodeText });
        }

        loadPanel.show();
    }

    function loadSummary(data) {
        const summary = JSON.parse(data);
        $('#pieChart').dxPieChart({
            type: 'doughnut',
            palette: 'Soft Pastel',
            title: 'Test Result Summary',
            dataSource: summary.pieData,
            animation: { enabled: true },
            legend: { visible: true },
            series: [{
                argumentField: 'result',
                valueField: 'count',
                label: {
                    visible: true,
                    format: 'fixedPoint',
                    precision: 0,
                    connector: { visible: true, width: 1 },
                },
            }],
            tooltip: {
                enabled: true,
                format: 'fixedPoint',
                precision: 0,
                customizeTooltip(arg) {
                    return {
                        text: `${arg.argumentText}: ${arg.valueText} cases`,
                    };
                },
            },
        });

        $('#passRate').text(`${summary.passRate.toFixed(1)}%`);

        if (window.moduleGrid) moduleGrid.dispose();
        moduleGrid = createModuleGrid(summary.moduleData);
    }

    function loadModuleTable(data) {
        const moduleData = JSON.parse(data);
        if (window.moduleGrid) moduleGrid.dispose();
        moduleGrid = createModuleGrid(moduleData);
    }

    function loadLineChart(data) {
        const chartData = JSON.parse(data);
        $('#lineChart').dxChart({
            dataSource: chartData,
            commonSeriesSettings: {
                argumentField: 'build',
                type: 'line',
            },
            series: [
                { valueField: 'passRate', name: 'Pass Rate (%)' },
                { valueField: 'total', name: 'Total Cases' },
            ],
            tooltip: { enabled: true },
            legend: { visible: true },
        });
    }

    function loadPoorCases(data) {
        const poorCases = JSON.parse(data);
        if (window.poorCasesDataGrid) poorCasesDataGrid.dispose();
        poorCasesDataGrid = createPoorGrid(poorCases);
    }

    function createModuleGrid(data) {
        return $('#moduleGrid').dxDataGrid({
            dataSource: data,
            columns: ['module', 'pass', 'fail', 'block', 'skip', 'total'],
            showBorders: true,
            rowAlternationEnabled: true,
            paging: { enabled: false },
        }).dxDataGrid('instance');
    }

    function createPoorGrid(data) {
        return $('#poorCasesGrid').dxDataGrid({
            dataSource: data,
            columns: ['name', 'failCount', 'executedCount', 'passRate'],
            showBorders: true,
            rowAlternationEnabled: true,
            paging: { enabled: false },
        }).dxDataGrid('instance');
    }

    // Initial data request
    vscode.postMessage({ command: 'Inital', isAuthor: false });
});
