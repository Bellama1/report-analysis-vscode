function getAiFixImageSrc() {
    return window.__AI_FIX_ICON || "";
}
function createAiFixImage(sizePx) {
    return $('<img>', {
        src: getAiFixImageSrc(),
        alt: 'AI Fix',
    }).css({
        width: sizePx + 'px',
        height: sizePx + 'px',
        'object-fit': 'contain',
        'vertical-align': 'middle'
    });
}

function createAiFixButton(options) {
    return $('<span>', { title: 'AI Fix' })
        .addClass('ai-fix-link')
        .css({
            display: 'inline-block',
            width: '22px',
            height: '22px',
            'vertical-align': 'middle',
            'margin-right': '8px',
            cursor: 'pointer'
        })
        .append(createAiFixImage(22))
        .on('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            postMessageToExtension({
                command: 'aiFixFailedCases',
                caseName: options.data.caseName,
                failedStep: options.data.failedStep,
                errMsg: options.data.errMsg,
                subfailed: options.data.subfailed,
                history: options.data.history,
                passRateDetail: options.data.passRateDetail,
                errorPic: options.data.rawErrorPic || options.data.errorPic
            });
        });
}

function getWebviewApi() {
    if (window.vscode && typeof window.vscode.postMessage === 'function') {
        return window.vscode;
    }
    try {
        if (typeof vscode !== 'undefined' && vscode && typeof vscode.postMessage === 'function') {
            return vscode;
        }
    } catch (error) {
        // Ignore and fallback.
    }
    return null;
}

function postMessageToExtension(payload) {
    const api = getWebviewApi();
    if (!api) {
        DevExpress.ui.notify("Unable to contact extension API.", "error", 2500);
        return false;
    }
    api.postMessage(payload);
    return true;
}

async function triggerAiFixAllFailedCases() {
    const failedGrid = $("#failedTable").dxDataGrid("instance");
    if (!failedGrid) {
        DevExpress.ui.notify("Failed grid is not ready.", "warning", 2000);
        return;
    }

    let failedCases = [];
    try {
        const dataSource = failedGrid.getDataSource();
        if (dataSource && dataSource.store && dataSource.store()) {
            const loadedCases = await dataSource.store().load();
            failedCases = Array.isArray(loadedCases) ? loadedCases : [];
        }
    } catch (error) {
        failedCases = [];
    }

    if (!failedCases.length) {
        const fallbackSource = failedGrid.option("dataSource");
        failedCases = Array.isArray(fallbackSource) ? fallbackSource : [];
    }

    if (!failedCases.length) {
        DevExpress.ui.notify("No failed cases found.", "warning", 2000);
        return;
    }

    const shouldStart = await DevExpress.ui.dialog.confirm(
        "Run AI Fix Auto for all failed cases? This runs one by one without per-case confirmation.",
        "Mass AI Fix"
    );
    if (!shouldStart) {
        return;
    }

    const sent = postMessageToExtension({
        command: 'aiFixAllFailedCases',
        failedCases: failedCases,
        autoMode: true
    });
    if (sent) {
        DevExpress.ui.notify("Mass AI Fix request sent.", "success", 2000);
    }
}

function createFailedTable(){
    return $("#failedTable").dxDataGrid({
        showBorders: true,
        rowAlternationEnabled: true,
        keyExpr: 'id',
        groupPanel: {
            visible: true,
        },
        scrolling: {
            mode: 'standard',
            useNative: true,
            showHeaders: true
        },
        height:'92vh',
        showHeaders: true,
        headerFilter: {
            visible: true,
          },
        filterRow: {
            visible: true,
            applyFilter: 'auto',
          },
        grouping: {
            autoExpandAll: true,
        },
        selection: {
            mode: 'single',
          },
          onSelectionChanged(e) {
            e.component.collapseAll(-1);
            e.component.expandRow(e.currentSelectedRowKeys[0]);
          },
        onCellClick: function (e) {
            if ($(e.event && e.event.target).closest('.ai-fix-link').length > 0) {
                return;
            }
            if(e.column.name==='caseName'){
                failedStep=e.row.data.failedStep;
                failedStep = failedStep.replaceAll(":",",");
                postMessageToExtension({
                    command: 'findKwLine',
                    kws: failedStep,
                    occurrence:e.row.data.failedStepOccurence,
                    caseName:e.row.data.caseName,
                    subfailed:e.row.data.subfailed
                  });
            }
        },

        searchPanel: {
            visible: true,
            width: 300,
        },
        summary: {
            groupItems: [
                {
                    column: 'id',
                    summaryType: 'count',
                },
            ],
        },
        columns: [
            {
                caption: 'Case Name',
                dataField: 'caseName',
                validationRules: [{
                    type: 'required',
                    message: 'The OrderDate field is required.',
                }],
                sortOrder: 'asc',
                width: '35%',
                cellTemplate(container, options) {
                    const content = $('<div>').css({
                        'white-space': 'normal',
                        'word-wrap': 'break-word'
                    }).append(createAiFixButton(options))
                        .append($('<a>', { href: '#' }).text(options.value || ''));
                    if(options.data.defectId){
                        content.append($('<div>').css('color', 'red').text('Defect ID:' + options.data.defectId));
                    }
                    content.appendTo(container);
                },
            },
            {
                caption: 'Priority',
                dataField: 'priority',
                width: '5%'
            },
            {
                caption: 'KeywordCount',
                dataField: 'failedStepOccurence',
                visible: false, // Set the "kwCount" data field to not be visible

            },
            {
                caption: 'Subfailed',
                dataField: 'subfailed',
                visible: false, // Set the "kwCount" data field to not be visible
            },
            {
                caption: 'Failed Step',
                dataField: 'failedStep',
                width: '40%',
                // groupIndex: 1,
                cellTemplate(container, options) {
                    var subfailed = options.data.subfailed;
                    var failedStep = options.data.failedStep;   
                    if(failedStep!=="" && failedStep.toUpperCase().startsWith("STEP")){
                        if((subfailed!==null && typeof subfailed!=='undefined') ){
                            var subkw = subfailed.failedkw;
                            $('<div>').css({'white-space': 'normal',
                            'word-wrap': 'break-word'}).
                            addClass('treeview').dxTreeView({
                                dataSource: [{id:1,text:failedStep,expanded: true,items:[{id:2,text:subkw}]}],
                                searchEnabled: false,
                                selectionMode: "single",
                                selectByClick: false,
                            }).appendTo(container);
                        }else{
                            $('<div>').css({'white-space': 'normal','word-wrap': 'break-word'}).text(failedStep).appendTo(container);
                        }
                    }else{
                        $('<div>').css({'white-space': 'normal','word-wrap': 'break-word'}).text(failedStep).appendTo(container);
                    }    
                },
            },
            {
                caption: 'Author',
                dataField: 'author',
            },
            {
                caption: 'Error Message',
                dataField: 'errMsg',
                groupIndex: 0,
            },
            {
                caption: 'Screenshot',
                dataField: 'errorPic',
                cellTemplate(container, options) {
                    $('<a>', { href: options.value })
                    .addClass('dx-link dx-icon-photo dx-link-icon')
                        .appendTo(container);
                },
                width: '5%',
            },
        ],
        masterDetail: {
            enabled: true,
            template(container, options) {
                var html = generateHistoryLines(options.data.passRateDetail,options.data.history);
                $('<div>').addClass('master-detail-caption').append(html).appendTo(container);
            },
        },
        toolbar: {
            items: [
                {
                    location: 'before',
                    template() {
                        return $('<div>')
                            .addClass('informer')
                            .append(
                                $('<h2>')
                                    .addClass('count')
                                    .text('---'),
                                $('<span>')
                                    .addClass('name')
                                    .text('Total Count'),
                            );
                    },
                },
                {
                    location: 'after',
                    widget: 'dxSelectBox',
                    options: {
                        width: 200,
                        items: [{
                            value: 'empty',
                            text: 'None',
                        }, {
                            value: 'errMsg',
                            text: 'Grouping by Message',
                        }, {
                            value: 'failedStep',
                            text: 'Grouping by Failed Step',
                        }],
                        displayExpr: 'text',
                        valueExpr: 'value',
                        value: 'errorMsg',
                        onValueChanged(e) {
                            $("#failedTable").dxDataGrid().dxDataGrid("instance").clearGrouping();
                            $("#failedTable").dxDataGrid().dxDataGrid("instance").columnOption(e.value, 'groupIndex', 0);
                            if(e.value==='empty'){
                                $("#failedTable").dxDataGrid().dxDataGrid("instance").columnOption('errorMsg', 'width', '40%');
                                $("#failedTable").dxDataGrid().dxDataGrid("instance").columnOption('failedStep', 'width', '20%');
                                $("#failedTable").dxDataGrid().dxDataGrid("instance").columnOption('author', 'width', '5%');
                                $("#failedTable").dxDataGrid().dxDataGrid("instance").columnOption('caseName', 'width', '35%');
                                $("#failedTable").dxDataGrid().dxDataGrid("instance").columnOption('errPic', 'width', '5%');
                            }else if(e.value==='errorMsg'){
                                $("#failedTable").dxDataGrid().dxDataGrid("instance").columnOption('failedStep', 'width', '40%');
                                $("#failedTable").dxDataGrid().dxDataGrid("instance").columnOption('author', 'width', '5%');
                                $("#failedTable").dxDataGrid().dxDataGrid("instance").columnOption('caseName', 'width', '40%');
                                $("#failedTable").dxDataGrid().dxDataGrid("instance").columnOption('errPic', 'width', '5%');
                            }else if(e.value==='failedStep'){
                                $("#failedTable").dxDataGrid().dxDataGrid("instance").columnOption('errorMsg', 'width', '40%');
                                $("#failedTable").dxDataGrid().dxDataGrid("instance").columnOption('author', 'width', '5%');
                                $("#failedTable").dxDataGrid().dxDataGrid("instance").columnOption('caseName', 'width', '40%');
                                $("#failedTable").dxDataGrid().dxDataGrid("instance").columnOption('errPic', 'width', '5%');
                            }
                            
                        },
                    },
                }, {
                    location: 'after',
                    widget: 'dxButton',
                    options: {
                        icon: 'expand',
                        onClick(e) {
                            const expanding = e.component.option('text') === 'Expand All';
                            $("#failedTable").dxDataGrid().dxDataGrid("instance").option('grouping.autoExpandAll', expanding);
                            e.component.option('text', expanding ? 'Collapse All' : 'Expand All');
                        },
                    },
                }, {
                    location: 'after',
                    widget: 'dxButton',
                    options: {
                        icon: 'refresh',
                        onClick() {
                            $("#failedTable").dxDataGrid().dxDataGrid("instance").refresh();
                        }
                        // onContentReady: function(e) {
                        //     $(".informer .count").text(0);
                        // },
                    },
                }, {
                    location: 'after',
                    widget: 'dxButton',
                    options: {
                        hint: 'Mass AI Fix',
                        template: function() {
                            return $('<span>', { 'aria-label': 'Mass AI Fix' })
                                .css({
                                    display: 'inline-flex',
                                    width: '18px',
                                    height: '18px',
                                    'align-items': 'center',
                                    'justify-content': 'center',
                                    overflow: 'visible'
                                })
                                .append(createAiFixImage(22).css({
                                    transform: 'scale(1.22)',
                                    'transform-origin': 'center'
                                }));
                        },
                        onClick() {
                            triggerAiFixAllFailedCases();
                        }
                    },
                },
            ],
        },
    }).dxDataGrid('instance');
}




