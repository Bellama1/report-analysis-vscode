function createDefectGrid(){
    return $('#defectedTable').dxDataGrid({
        showBorders: true,
        rowAlternationEnabled: true,
        keyExpr: 'id',
        groupPanel: {
            visible: true,
        },
        height:'92vh',
        scrolling: {
            mode: 'virtual',
        },
        grouping: {
            autoExpandAll: false,
        },
        headerFilter: {
            visible: true,
        },
        filterRow: {
            visible: true,
            applyFilter: 'auto',
          },
        searchPanel: {
            visible: true,
            width: 300,
        },
        onCellClick: function (e) {
            if(e.column.name==='caseName'){
                vscode.postMessage({
                    command: 'findKwLine',
                    kws: '',
                    occurrence:1,
                    caseName:e.row.data.caseName,
                    subfailed:null,
                  });
            }
        },
        summary: {
            groupItems: [
                {
                    column: 'defectId',
                    summaryType: 'count',
                },
            ],
        },
        selection: {
            mode: 'single',
          },
        onSelectionChanged(e) {
            e.component.collapseAll(-1);
            e.component.expandRow(e.currentSelectedRowKeys[0]);
        },
        onContentReady: function(e) {
            const totalCount = e.component.totalCount();
            $("#defectedTable .count").text(totalCount);
        },
        columns: [
            {
                caption: 'Defect ID',
                dataField: 'defectId',
                width: '12%',
            },
            {
                caption: 'Case Name',
                dataField: 'caseName',
                width: '58%',
                cellTemplate(container, options) {
                    $('<div>').css({
                        'white-space': 'normal',
                        'word-wrap': 'break-word'
                    }).append($('<a>', { href: '#' }).text(options.value || ''))
                        .appendTo(container);
                },
            },
            {
                caption: 'Defect Status',
                dataField: 'defectStatus',
                width: '15%',
                cellTemplate(container, options) {
                    const status = options.data.detail ? options.data.detail.defectStatus : options.data.defectStatus;
                    $('<div>').text(status || '').appendTo(container);
                },
            },
            {
                caption: 'Execution Status',
                dataField: 'status',
                width: '15%'
            },
            {
                dataField: 'detail',
                visible: false
            }],
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
                                        .text('0'),
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
                                value: 'defectId',
                                text: 'Defect Id',
                            }, ],
                            displayExpr: 'text',
                            valueExpr: 'value',
                            value: 'errorMsg',
                            onValueChanged(e) {
                                defectedDataGrid.clearGrouping();
                                defectedDataGrid.columnOption(e.value, 'groupIndex', 0);
                            },
                        },
                    }, {
                        location: 'after',
                        widget: 'dxButton',
                        options: {
                            icon: 'expand',
                            onClick(e) {
                                const expanding = e.component.option('text') === 'Expand All';
                                defectedDataGrid.option('grouping.autoExpandAll', expanding);
                                e.component.option('text', expanding ? 'Collapse All' : 'Expand All');
                            },
                        },
                    }, {
                        location: 'after',
                        widget: 'dxButton',
                        options: {
                            icon: 'refresh',
                            onClick() {
                                defectedDataGrid.refresh();
                            },
                        },
                    },
                ],
            },
        masterDetail: {
            enabled: true,
            template(container, options) {
                // var divId = "Form"+options.data.defectId;
                // if(!isNaN(options.data.defectId)){
                //     vscode.postMessage({
                //         command: 'defectDetail',
                //         defectId: options.data.defectId,
                //     });
                //     loadPanel.show();
                // }
                $('<div>').addClass('defect-form form-container').dxForm({
                    formData:options.data.detail,
                    colCount: 2,
                    loadPanel: {
                        enabled: true,
                    },
                    items: [
                        { colSpan: 2,dataField: 'summary', label: { text: 'Summary', },editorType: 'dxTextArea',
                        editorOptions: {
                          height: 60,
                          maxLength: 200,
                          disabled: true, 
                        }, },
                        { dataField: 'id', label: { text: 'Detect ID', }, editorOptions: { disabled: true, } },
                        { dataField: 'defectStatus', label: { text: 'Status', }, editorOptions: { disabled: true, } },
                        { dataField: 'detectedBy', label: { text: 'Detect By', }, editorOptions: { disabled: true, } },
                        { dataField: 'detectedOn', label: { text: 'Detect On', }, editorOptions: { disabled: true, } },
                        { dataField: 'severity', label: { text: 'Severity', }, editorOptions: { disabled: true, } },
                        { dataField: 'assignTo', label: { text: 'Assign To', }, editorOptions: { disabled: true, } },
                        { colSpan: 2,dataField: 'comments', label: { text: 'Comments', },editorType: 'dxTextArea',
                        editorOptions: {
                          height: 160,
                          maxLength: 200,
                        //   disabled: true, 
                        }, },
                    ],
                }).appendTo(container);
            }
        }
    }).dxDataGrid('instance');
}

