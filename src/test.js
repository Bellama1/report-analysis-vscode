const fs = require('fs');
const path = require('path');

function _find_file_uri(case_name) {
    let pathName = "C:/Workspace/Robot/acceptance-tests/RCM/01__SEAR (Search)/01__RAT (Rate Search)/AIR (Air rate search)/LOOSE (Air loose rate search)/CR (Constructed Rate Details check)";
    var files = fs.readdirSync(pathName);
    var case_uri = "";
    for(var item=0;item<files.length;item++){
        let stat = fs.lstatSync(path.join(pathName, files[item]))
        if(stat.isDirectory()){
            case_uri = this._find_file_uri(path.join(pathName, files[item]),case_name)
            if (case_uri == ""){
                continue;
            }else{
                return case_uri;
            }
        }else if(stat.isFile()){
            console.log("aaaaaaaaa"+files[item]);
          if(files[item]==case_name+".robot"){
              console.log("find you"+files[item]);
              case_uri = path.join(pathName, files[item]);
              return case_uri;
          }else{
            continue;
          }
        }
    }
    return case_uri;
}


function _find_kw_line(document, kw_string, occurrence) {
    var first_character = kw_string[0];
    if (kw_string.endsWith(","))
        kw_string = kw_string.substring(0, kw_string.length - 1);
    let kw_array = kw_string.split(",");
    let document_array = document.split(/\r?\n/);
    let matchCount = 0;
    for (var line = 0; line < document_array.length; line++) {
        var line_string = document_array[line].replace(/(^\s*)|(\s*$)/g, "")
        var isMatch = this.ifLineMatch(line_string, kw_array)
        if (isMatch) {
            matchCount++;
            if (matchCount == occurrence) {
                var firstCharcter = document_array[line].indexOf(first_character);
                var length = document_array[line].length;
                return [line, firstCharcter, firstCharcter + length]
            } else {
                continue;
            }
        } else {
            continue;
        }
    }
    return [0, 0, 0]
}

var aa = _find_file_uri("RCM_SEAR_RAT_AIR_LOOSE_CR_TC_2016_RCM_Air Income Rate Search with Export and Import Quote Numbers and different INCO Terms")
var cc = _find_kw_line()
console.log(aa)