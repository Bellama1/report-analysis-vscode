function createDefectCloseGrid(){
    return $('#defectClosedTable').dxDataGrid({
        showBorders: true,
        rowAlternationEnabled: true,
        keyExpr: 'defectId',
        groupPanel: {
            visible: false,
        },
        scrolling: {
            mode: 'virtual',
        },
        height:'92vh',
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
                width: '10%',
            },
            {
                caption: 'Case Name',
                dataField: 'caseName',
                width: '50%',
                cellTemplate(container, options) {
                    $('<div>').css({
                        'white-space': 'normal',
                        'word-wrap': 'break-word'
                    }).append($('<a>', { href: '#' }).text(options.value || ''))
                        .appendTo(container);
                },
            },
            {
                caption: 'Status',
                dataField: 'status',
                width: '10%'
            },
            {
                caption: 'Status In QC',
                dataField: 'defectStatus',
                width: '10%'
    
            },
            {
                caption: 'Description',
                dataField: 'doc',
                width: '15%'
            },
            ,
            {
                caption: 'Module',
                dataField: 'module',
                width: '10%',
                groupIndex: 0
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
        // masterDetail: {
        //     enabled: false,
        //     template(container, options) {
        //         var divId = "Form"+options.data.defectId;
        //         if(!isNaN(options.data.defectId)){
        //             vscode.postMessage({
        //                 command: 'defectDetail',
        //                 defectId: options.data.defectId,
        //             });
        //             loadPanel.show();
        //         }
        //         $('<div id="'+divId+'">').addClass('defect-form form-container').dxForm({
        //             colCount: 2,
        //             loadPanel: {
        //                 enabled: true,
        //             },
        //             items: [
        //                 { colSpan: 2,dataField: 'summary', label: { text: 'Summary', },editorType: 'dxTextArea',
        //                 editorOptions: {
        //                   height: 60,
        //                   maxLength: 200,
        //                   disabled: true, 
        //                 }, },
        //                 { dataField: 'id', label: { text: 'Detect ID', }, editorOptions: { disabled: true, } },
        //                 { dataField: 'defectStatus', label: { text: 'Status', }, editorOptions: { disabled: true, } },
        //                 { dataField: 'detectedBy', label: { text: 'Detect By', }, editorOptions: { disabled: true, } },
        //                 { dataField: 'detectedOn', label: { text: 'Detect On', }, editorOptions: { disabled: true, } },
        //                 { dataField: 'severity', label: { text: 'Severity', }, editorOptions: { disabled: true, } },
        //                 { dataField: 'assignTo', label: { text: 'Assign To', }, editorOptions: { disabled: true, } },
        //                 { colSpan: 2,dataField: 'comments', label: { text: 'Comments', },editorType: 'dxTextArea',
        //                 editorOptions: {
        //                   height: 160,
        //                   maxLength: 200,
        //                 //   disabled: true, 
        //                 }, },
        //             ],
        //         }).appendTo(container);
        //     }
        // }
    }).dxDataGrid('instance');
}

