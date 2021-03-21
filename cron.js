console.log("VERSION 5.14.2020.11.32");

//Get basic keys
const fs = require('fs');
let rawdata = fs.readFileSync('keys.json');
const keys = JSON.parse(rawdata);

    console.log("Keys",keys);
    
    
//Include basics
const Redis = require("redis-fast-driver");
const mongodb = require("mongodb");
const ObjectID = mongodb.ObjectID;
const Long = mongodb.Long;

 
 
//Connect redis.
const redisClientParams = { host: keys.REDIS_URL, port: 6379, autoConnect:true, doNotRunQuitOnEnd: true };
const redisClient = new Redis(redisClientParams);

    
    
    
    
//Mongo connection init function (entry point)    
const connectMongo = async () => {

    //Connect mongo
    const client = mongodb.MongoClient;

    try {
        let url=keys.ADVANCED_MONGO_URL;
        let dbname=keys.ADVANCED_MONGO_DB;
        
        client.connect(url, function (err, client) {
            
            client.on('reconnect', () => {
				console.log('Mongo connection re-established');
			});
			
			client.on('close', () => {
				console.log("Mongo connection closed, restarting service");
				process.exit();
            });

            let mongoClientDB = client.db(dbname);
            
            console.log("Mongo connection complete ["+url+"] ["+dbname+"]... Err:",err);

             //Initialize Loops
            process_testEvent(mongoClientDB);
        });
        
    } catch(err) {
        console.log("Mongo connection err",err);
        process.exit();
    }

     
}

const getNow = () => {
    return Math.floor(Date.now() / 1000);
}


//testEvent handler
const process_testEvent = async (mongo) => {


    var initialTimeStamp = new Date();
    console.log("testEvent STARTED, TIME: ", initialTimeStamp.toTimeString());

        while (true) {
            try {
                  await redisClient.rawCallAsync(["blpop", "testEvent", 0]).then(async function (eventData) {
                    var eventDetails=eventData[1];
                    var eds=eventDetails.split("||");
                    var taskId=eds[0];
                    var expiry=eds[1];
                    if(getNow() < expiry) {
                        console.log("Time to process "+taskId);
                        var executionStart=getNow();
                        
                        //Set task running details
                        await mongo.collection('systasks').updateOne({'_id': new ObjectID(taskId)},
                        { $set: { 'runningState': 1, 'runningStartDate': executionStart}  }); 

                        
                        //Get the task
                        var theTask = await mongo.collection('systasks').findOne({'_id': new ObjectID(taskId)});
                        console.log("The task details:",theTask);
                    
                        
                        //Set task execution expiry and next run time
                        var expiry=executionStart+theTask.executionMax;
                        var nextrun=executionStart+theTask.frequency;
                        await mongo.collection('systasks').updateOne({'_id': new ObjectID(taskId)},
                        { $set: { 'nextRunDate': nextrun, 'runExpireDate': expiry}  });
                        
                                //Do logic
                                console.log("Do some logic with "+theTask.sysTaskName);
                                var theParams=JSON.parse(theTask.eventParams);
                                console.log("Event params",theParams);
                                
                        //Mark task completion details
                        var executionEnd=getNow();
                        var executionLength=executionEnd-executionStart;
                        
                        await mongo.collection('systasks').updateOne({'_id': new ObjectID(taskId)},
                        { $set: { 'lastRunLength': executionLength, 'runningState': 0, 'calledState':0}  });
                        
                        console.log("Moving on...");
				
                    } else {
                        console.log("Skipping expired call to task ["+taskId+"] [Expires:"+expiry+"] [Now:"+getNow()+"]");
                    }
                });
            } catch(err) {
                    console.log("blpop err",err);
            }
        }
   
}



//Start the service
redisClient.on("ready",function() {
    
    connectMongo();

});



console.log("After loop - exiting");
        
 