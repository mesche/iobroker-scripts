//
//===================================================================
//	                 IOBROKER - SQL-HISTORY ADAPTER
//                       DATA POINT - SETTINGS
//                              RESTORE
//		                  -- VERSION 0.1.0 --
//
// This script reads the SQL-History adapter settings of all data points where the SQL-History adapter 
// is enabled and saves the settings in a defined data point for backup.
//
// If data points have to be deleted and recreated, the previous SQL-History adapter 
// settings can be restored using the appropriate restore script.
// 
// Internals
// ---------- 
// The script creates a data point under the given path to store the settings.
//
// Prerequisites
// ------------- 
// Adapter - ioBroker.sql - https://github.com/ioBroker/ioBroker.sql
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
 * Creates the state and object for the backup settings in javascript space if does not exist
 * 
 * @param cbFnc function called after state is created and initialized.
 */
function createBackupDataPoint(cbFnc) {
    createState(ID_DP_BACKUP_SETTINGS, {
        val: '', def: '',
            name: 'SQL-History adaper datapoint settings', 
            type: 'string', role: 'state', 
            read: true, write: false
        }, 
        cbFnc
    );
}

/**
 * Load the SQL-History adapter settings of all enabled data points and stores the result into the data point of the given id. 
 * 
 * @param adapterInstance the SQL-History adapter instance to load the settings from 
 * @param idStoreDP the id of the data point in which the settings are stored.
 * 
 * @return the SQL-History adapter settings as object
 */
async function storeConfigForEnableHistoryForDp(adapterInstance, idStoreDP) {
    return new Promise((resolve) => {
        sendTo(adapterInstance, 'getEnabledDPs', {}, function (settings) {
            setState(idStoreDP, JSON.stringify(settings), true, function(err) {
                if(err) {
                    log(err, 'error');
                    throw new Error(err);
                }
                log('SQL-History adapter data point settings stored successfully to ' + idStoreDP);
                resolve(settings);   
            });
        });
    });
}

// *******
//   MAIN
// *******

/**
 *  Creates a data point and store the settings.
 */
createBackupDataPoint(async function() {
    await storeConfigForEnableHistoryForDp(SQL_HISTORY_INSTANCE, ID_DP_BACKUP_SETTINGS);
    stopScript(null); // call without arguments to stop itself
});
