import * as path from 'path';
import Mocha = require('mocha');

export function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true
    });

    mocha.addFile(path.resolve(__dirname, './reportAnalysisAi.test.js'));

    return new Promise((resolve, reject) => {
        try {
            mocha.run(failures => {
                if (failures > 0) {
                    reject(new Error(`${failures} test(s) failed.`));
                    return;
                }
                resolve();
            });
        } catch (error) {
            reject(error);
        }
    });
}