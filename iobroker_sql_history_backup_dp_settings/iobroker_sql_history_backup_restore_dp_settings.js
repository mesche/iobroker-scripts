//
//===================================================================
//	                 IOBROKER - SQL-HISTORY ADAPTER
//                       DATA POINT - SETTINGS
//                              RESTORE
//		                  -- VERSION 0.1.0 --
//
// This script restores the settings of the SQL-History adapter 
// for data points that were previously saved with the backup script.
//
// If data points have to be deleted and recreated, the SQL-History adapter 
// settings can be stored using the appropriate store script.
// 
// Internals
// ---------- 
// The script reads the data of the data point under the given path to restore the settings.
//
// Prerequisites
// ------------- 
// Adapter - ioBroker.sql - https://github.com/ioBroker/ioBroker.sql
// Adapter - ioBroker.javascript - https://github.com/iobroker/ioBroker.javascript
//
//
//    ::::::::::::::: www.blogging-it.com :::::::::::::::
//    
// Copyright (C) 2021 Markus Eschenbach. All rights reserved.
// 
// 
// This software is provided on an "as-is" basis, without any express or implied warranty.
// In no event shall the author be held liable for any damages arising from the
// use of this software.
// 
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter and redistribute it,
// provided that the following conditions are met:
// 
// 1. All redistributions of source code files must retain all copyright
//    notices that are currently in place, and this list of conditions without
//    modification.
// 
// 2. All redistributions in binary form must retain all occurrences of the
//    above copyright notice and web site addresses that are currently in
//    place (for example, in the About boxes).
// 
// 3. The origin of this software must not be misrepresented; you must not
//    claim that you wrote the original software. If you use this software to
//    distribute a product, an acknowledgment in the product documentation
//    would be appreciated but is not required.
// 
// 4. Modified versions in source or binary form must be plainly marked as
//    such, and must not be misrepresented as being the original software.
//    
//    ::::::::::::::: www.blogging-it.com :::::::::::::::
//===================================================================

// ***** CONFIGURATION ******

const JS_INSTANCE = 'javascript.0';
const SQL_HISTORY_INSTANCE = 'sql.0';
const ID_DP_BACKUP_SETTINGS = JS_INSTANCE + '.Backup.Adapter.' + SQL_HISTORY_INSTANCE + '.settings';

/**
 * Load the stored SQL-History adapter settings of all enabled data points.
 * 
 * @return the SQL-History adapter settings as object
 */
async function getStoredDataPointSettings() {
    return new Promise((resolve) => {
        existsState(ID_DP_BACKUP_SETTINGS, function (err, isExists) {
            if(err) {
                log(err, 'error');
                throw new Error(err);
            }else if(isExists) {
                var dp = getState(ID_DP_BACKUP_SETTINGS);
                resolve(JSON.parse(dp.val));
            } else {
                log('Can not find datapoint ' + ID_DP_BACKUP_SETTINGS + ' with backup settings.', 'warn');
                resolve(null);
            }
        });
    });
}

/**
 * Restores the given SQL-History adapter settings into the given data point id.
 * 
 * @param adapterInstance the SQL-History adapter instance to restore the settings for 
 * @param dpId the id of the data point for which the settings are restored
 * @param dpSettings the SQL-History adapter settings to restore
 * 
 * @return true if restore was successful or null if the data point could not be found by id
 */
async function restoreSettingsForForDp(adapterInstance, dpId, dpSettings) {
    return new Promise((resolve) => {
        existsState(dpId, function (err, isExists) {
            log('Restore enabled SQL-History adapter settings for data point ' + dpId);

            if(err) {
                log(err, 'error');
                throw new Error(err);
            }else if(isExists) {
                sendTo(adapterInstance, 'enableHistory', { id: dpId, options: dpSettings }, function(result) {
                    if (result.error) {
                        throw new Error(result.error);
                    } else {
                        resolve(result.success);
                    }
                });
            } else {
                log('Can not find data point ' + dpId + ' to restore settings. Ignored...', 'warn');
                resolve(null);
            }
        });
    });
}



/**
 * Start the restore of the SQL-History adapter settings
 */
async function runRestore() {
    var settings = await getStoredDataPointSettings();

    if(settings === null) {
        log('No stored SQL-History adapter settings to restore found!');
    } else {
        Object.keys(settings).forEach(async function(dpId) {
            await restoreSettingsForForDp(SQL_HISTORY_INSTANCE, dpId, settings[dpId]);
        });
        log('SQL-History adapter data point settings restored successfully!');        
    }
    stopScript(null); // call without arguments to stop itself
}

// *******
//   MAIN
// *******

runRestore();
