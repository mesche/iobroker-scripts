//
//===================================================================
//	                Global - State - Eventhandler
//		                -- VERSION 1.0.0 --
//
// This script is a workaround to avoid some communication problems 
// with the ioBroker HomeMatic RPC Adapters (ioBroker.hm-rpc).
// It is useful if multiple setState commands are triggered in a short time.
// A global queue is used to execute multiple setState commands synchronously.
// 
// Blog
// ------------- 
// https://www.blogging-it.com/setstate-synchrone-verarbeitung-der-iobroker-homematic-rpc-adapter-befehle-via-bin-rpc-xml-rpc-um-probleme-bei-der-kommunikation-zu-vermeiden/hausautomatisierung-smart-home/iobroker/skripte-und-logiken.html 
//
//
// Prerequisites
// ------------- 
// Javascript Script Engine - https://github.com/ioBroker/ioBroker.javascript
// HomeMatic RPC Adapter - https://github.com/ioBroker/ioBroker.hm-rpc
//
//
// Installation
// ------------- 
// Save the code as global script in ioBroker
//
//
// Usage
// ------------- 
// (async () => {
//    GSH.setState('javascript.0.variables.test', '1'); // do not wait until action have been processed
//    await GSH.setState('javascript.0.variables.test', '2'); // wait until action have been processed
//    await GSH.waitWhileProcessing(); // wait until all actions in queue have been processed
// })();
//
//
//
//    ::::::::::::::: www.blogging-it.com :::::::::::::::
//    
// Copyright (C) 2022 Markus Eschenbach. All rights reserved.
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


const GLOBAL_STATE_HANDLER = (function() {

    /**
     * Enumeration of all possible result codes that may occur during processing.
     */
    const GLOBAL_STATE_PROCESSING_RESULTS = {
        NONE: 'none',   
        TIMEOUT: 'timeout reached',
        ACK: 'value acknowledged',
        ERR: 'error',
        PROC: 'processing'
    };

    /**
     * Logger class to encapsulate the logic for logging
     */
    class GlobalStateLogger {
        #logDebugActive = true;

        log(msg, sev) {
            if(sev !== 'debug' || this.#logDebugActive) {
                log(msg, sev);
            }
        }
    
        /**
         * Gives out the message into log if log debugging is active
         * 
         * @param msg the message string 
         * 
         */
        debug(msg) {
            this.log(msg, 'debug');
        }

        info(msg) {
            this.log(msg, 'info');
        }

        error(msg) {
            this.log(msg, 'error');
        }

        warn(msg) {
            this.log(msg, 'warn');
        }
    }

    /**
     * Queue entry contain all necessary data to execute the queued action.
     * Used to add these data to the queue list.
     */
    class GlobalStateQueueEntry {
         // holds promise resolve/reject functions
        #resultDeferred = null;

        // action data
        action = null;
        dpId = null;
        state = null;
        cbFn = null;
        
        constructor(action, dpId, state, cbFn) {
            this.action = action;
            this.dpId = dpId;
            this.state = state;
            this.cbFn = cbFn;
        }

        static createSetState(dpId, state, cbFn) {
            return new GlobalStateQueueEntry('setState', dpId, state, cbFn);
        }

        getSetStateLabel() {
            return `${this.action}(${this.dpId},${this.state})`;
        }

        setResultDeferred(resolve, reject) {
            this.#resultDeferred = {resolve: resolve, reject: reject};
        }

        resultResolve() {
            this.#resultDeferred.resolve();
        }
    }

    /**
     * The Queue manages a list of queue entries.
     */
    class GlobalStateQueue {
        #queueList = [];

        constructor() {

        }

        addEntry(entry) {
            this.#queueList.push(entry);
            return new Promise((resolve, reject) => entry.setResultDeferred(resolve, reject));
        }

        size() {
            return this.#queueList.length;
        }

        hasNext() {
            return this.size() > 0;
        }

        next() {
            return this.getQueue()[0];
        }

        removeOldest() {
            this.getQueue().shift(); // remove the first entry in queue.
        }

        getQueue() {
            return this.#queueList;
        }

    }

    /**
     * Processor class, to start an action and ensure the synchron execution.
     * If several actions have to be processed, they were internally added to a queue and processed synchronously.
     * If an acknowlegement is needed for the correct confirmation processing of an action, the processing of the 
     * next entry is delayed until the acknowlegement is available or the defined timeout is reached.
     */
    class GlobalStateSynchronProcessor {
        // instances
        #stateLog = null;
        #stateQueue = null;

        // configuration
        #stateProcTimeout = 4000; // 4 Sec.
        #stateProcCheckInterval = 500; // 0,5 Sec.

        // temporary processing variables
        #stateProcEntry = null;
        #stateProcStatus = GLOBAL_STATE_PROCESSING_RESULTS.NONE;
        #stateProcTimerCheckInterval = null;
        #stateProcTimerTimeout = null;
        #stateProcTimerAck = null;


        constructor(stateLog, stateQueue) {
            this.#stateLog = stateLog || new GlobalStateLogger();
            this.#stateQueue = stateQueue || new GlobalStateQueue();
        }

        async setStateSync(entry) {
            const retPromise = this.#stateQueue.addEntry(entry);
            this.#log(`${entry.getSetStateLabel()} added to state queue (new size: ${this.#stateQueue.size()})`);

            if(this.isStateQueueProcessing()) {
                this.#log(`${entry.getSetStateLabel()} processing after already ${this.#stateQueue.size()-1} queued entries has been processed...`);
            } else { // start queue processing if not already started
                this.#stateProcStatus = GLOBAL_STATE_PROCESSING_RESULTS.PROC;
                this.#processStateQueueNextEntry();
            }

            if(!this.#stateProcTimerCheckInterval) {
                this.#stateProcTimerCheckInterval = setInterval(function() {
                    if(!this.#checkIfStateQueueProcessing()) {
                        clearInterval(this.#stateProcTimerCheckInterval);
                        this.#stateProcTimerCheckInterval = null;
                    }            
                }.bind(this), this.#stateProcCheckInterval);
            }

            return retPromise;
        }

        isStateQueueProcessing() {
            return this.#stateProcStatus === GLOBAL_STATE_PROCESSING_RESULTS.PROC;
        }

        #processStateQueueNextEntry() {   
            this.#stateProcEntry = this.#stateQueue.next();
            this.#log(`processStateQueueNext: ${this.#stateProcEntry.getSetStateLabel()}`);

            this.#execSetState(this.#stateProcEntry);
        }

        #initTimers(entry) {
            this.#stateProcTimerTimeout = setTimeout(function() {
                this.#stateProcStatus = GLOBAL_STATE_PROCESSING_RESULTS.TIMEOUT;
                this.#log(`StateProcTimeout: ${entry.getSetStateLabel()} takes longer or error occurred. set result > ${this.#stateProcStatus}`);

                this.#clearTimers(this.#stateProcStatus);
            }.bind(this), this.#stateProcTimeout);

            this.#stateProcTimerAck = on({id: entry.dpId, val: entry.state, ack: true}, function(evt) {
                this.#stateProcStatus = GLOBAL_STATE_PROCESSING_RESULTS.ACK;
                this.#log(`StateProcAckEvent: ${entry.getSetStateLabel()} acknowledge of adjusted setpoint reached. set result > ${this.#stateProcStatus}`);

                this.#clearTimers(this.#stateProcStatus);
            }.bind(this));       
        }

        #clearTimers(synchWorkStatus) {
            let msgTimerLabels = [];
            if (this.#stateProcTimerAck) {
                unsubscribe(this.#stateProcTimerAck);
                this.#stateProcTimerAck = null;
                msgTimerLabels.push('StateProcAckEvent');
            }

            if(this.#stateProcTimerTimeout){
                if(synchWorkStatus !== GLOBAL_STATE_PROCESSING_RESULTS.TIMEOUT) { // not necessary and avoid log warning ['_destroyed'] !== true
                    clearTimeout(this.#stateProcTimerTimeout);
                }
                this.#stateProcTimerTimeout = null;
                msgTimerLabels.push('StateProcTimeout');
            }

            if(msgTimerLabels.length > 0) {
                this.#log(`${msgTimerLabels.join(' & ')} timer cleared.`);
            }
        }

        #execSetState(entry) {
            this.#log(`Exec ${entry.getSetStateLabel()}`);
            setState(entry.dpId,entry.state,false,function(err) {
                if(err) {
                    this.#stateProcStatus = GLOBAL_STATE_PROCESSING_RESULTS.ERR;
                    this.#stateLog.error(`execSetState: Error occurred - ${entry.getSetStateLabel()} - ${JSON.stringify(err)}. set result > ${this.#stateProcStatus}`);
                    this.#clearTimers(this.#stateProcStatus);
                }
            }.bind(this));

            this.#initTimers(entry);

            return true;   
        }
        
        #checkIfStateQueueProcessing() {
            const procEntryLbl = 'checkIfStateQueueProcessing: ' + this.#stateProcEntry.getSetStateLabel();

            if(this.isStateQueueProcessing()) {
                this.#log(`${procEntryLbl} - still processing...`);
            } else {
                if(typeof this.#stateProcEntry.cbFn === 'function') {
                    this.#log(`${procEntryLbl} - execute callback function`);
                    this.#stateProcEntry.cbFn(this.#stateProcStatus, this.#stateProcEntry);
                }
                this.#stateProcEntry.resultResolve();
                this.#stateQueue.removeOldest(); // remove the processed entry.
                this.#log(`${procEntryLbl} - entry processed with result "${this.#stateProcStatus}" > removed from queue (new size: ${this.#stateQueue.size()})`);
                
                this.#stateProcEntry = null;

                if(this.#stateQueue.hasNext()) {
                    this.#stateProcStatus = GLOBAL_STATE_PROCESSING_RESULTS.PROC;
                    this.#processStateQueueNextEntry();
                } else {
                    this.#stateProcStatus = GLOBAL_STATE_PROCESSING_RESULTS.NONE;
                    this.#log("checkIfStateQueueProcessing: Queue empty! All entries proccessed");
                }
            }

            return this.isStateQueueProcessing();
        }

        #log(msg){
            this.#stateLog.debug(msg);
        }
    }



    // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

    /**
     * Handler class, to provide some simple public function to run actions synchronously.
     * 
     * Internal: Define with constant to avoid error 'Cannot find name (2304)'
     */
    // 
    const GlobalStateHandler = class {
        // instances
        #stateProc = null;
        #stateLog = null;

        // configuration
        #waitWhileProcessingCheck = 500; // 0,5 Sec.
            
        constructor() {
            this.#stateLog = new GlobalStateLogger();
            this.#stateProc = new GlobalStateSynchronProcessor(this.#stateLog);
        }

        async setState(dpId, state, cbFn){
            const entry = GlobalStateQueueEntry.createSetState(dpId, state, cbFn); 
            let retVal;
            if(this.#synchProccessingRequired(dpId)) {
                retVal = this.#stateProc.setStateSync(entry);
            } else {
                this.#stateLog.debug(`Exec ${entry.getSetStateLabel()} normally.`);
                setState(dpId, state, false, cbFn);
                retVal = Promise.resolve(true);
            }

            return retVal;
        }

        async waitWhileProcessing() {
            return new Promise(resolve => {
                if(this.#stateProc.isStateQueueProcessing()) {
                    let waitWhileProcessingInterval = setInterval(function() {     
                        if(!this.#stateProc.isStateQueueProcessing()){
                            clearInterval(waitWhileProcessingInterval);
                            waitWhileProcessingInterval = null;
                            resolve();
                        }   
                    }.bind(this), this.#waitWhileProcessingCheck);
                } else {
                    resolve();
                }
            });
        }

        #synchProccessingRequired(dpId) { 
            return dpId.indexOf('hm-rpc.') > -1;
        }
    }


    return new GlobalStateHandler();

})();

const GSH = GLOBAL_STATE_HANDLER;

