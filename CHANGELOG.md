# Change Log

All notable changes to the "report-analysis" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Release 1.0.0]
- Extension on line

## [Release 2.0.0]

- 1.report page could be closed and opened without a problem
- 2.report url could be configure in settings.json

## [Release 3.0.0]
- 1.fix report file missing in some module
- 2.optimize process, reduce downloading report step
- 3.when open robot scipts,the focus point is in the failed step

## [Release 3.0.1]
- 1.optimize report analysis page UI and page loading time

## [Release 3.0.2]
- 1.fix case jump issue

## [Release 3.0.3]
- 1.add filter in webview page
- 2.add column : author 

## [Release 3.0.4]
- 1.add check history
- 2.fix jump issue: to ignore keyword uppercase/lowercase

## [Release 4.0.0]
- 1.update ui,add summary page
- 2.for failed case, two tabs shows: failed cases and defected cases

## [Release 4.1.0]
- 1.add 2 tabs in general tab: unstable cases and defect closed cases
- 2.for failed case, failed step show sub kw and parent kw
- 3.for defect related case, do not do real-time query. The result is searched after module execution is done 

## [Release 4.4.0]
- 1.add ai fix

## [Release 4.4.1]
- Load the latest version's general overview before fetching author or module information.
- Reduce the initial wait time by loading report details in the background.
- Support local report folders with the same JSON layout as hosted reports.
- Add product-scoped settings with backward compatibility for the legacy report URL.
- Add structured AI Fix requests and a reusable Robot self-heal skill.
- Harden report paths, Python process errors, and webview content rendering.
