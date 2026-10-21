function createPoorGrid(){
     return $("#poorCasesTable").dxDataGrid(
        {
            showBorders: true,
            rowAlternationEnabled: true,
            keyExpr: 'caseName',
            groupPanel: {
                visible: false,
            },
            scrolling: {
                mode: 'virtual',
            },
            height:'92vh',
            headerFilter: {
                visible: true,
              },
            filterRow: {
                visible: true,
                applyFilter: 'auto',
              },
            grouping: {
                autoExpandAll: true,
                contextMenuEnabled:true,
            },
            selection: {
                mode: 'single',
              },

              onCellClick: function (e) {
                  if(e.column.name==='caseName'){
                      vscode.postMessage({
                        command: 'findKwLine',
                        kws: '',
                        occurrence:'',
                        caseName:e.row.data.caseName,
                        subfailed:''
                      });
                  }
              },
              loadPanel: {
                  enabled: true,
              },
              summary: {
                  groupItems: [
                      {
                          column: 'caseName',
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
                      width: '80%',
                      sortOrder: 'asc',
                      cellTemplate(container, options) {
                        $('<div>').css({
                            'white-space': 'normal',
                            'word-wrap': 'break-word'
                        }).append($('<a>', { href: '#' }).text(options.value || ''))
                            .appendTo(container);
                    },
                  },
                  {
                    caption: 'Type',
                    dataField: 'type',
                    groupIndex: 0,
                },
                    {
                      caption: 'Module',
                      dataField: 'module',
                      visible: true, // Set the "kwCount" data field to not be visible
                      width: '19%',
                      groupIndex: 1,
                      autoExpandGroup: false
                  },
                  {
                    dataField: 'history',
                    visible: false, // Set the "kwCount" data field to not be visible
                }
              ],
              masterDetail: {
                enabled: true,
                template(container, options) {
                    var html = generateHistoryLines("",options.data.history);
                    $('<div>').addClass('master-detail-caption').append(html).appendTo(container);
                },
            },
        }
    ).dxDataGrid('instance');
}
