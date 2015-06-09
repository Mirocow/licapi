/**
 * Created by SlashMan on 10.05.2015.
 */
var express = require('express');
var app = express();
var i18n = require('i18n');
var md5 = require('MD5');
var Sequelize = require('sequelize');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var _ = require('underscore');

i18n.configure({
    locales: ['en', 'ru'],
    cookie: 'locale',
    directory: __dirname + '/locales'
});

app.use( bodyParser.json() );
app.set('view engine', 'jade');
app.use(express.static('public'));
app.use(cookieParser());
app.use(i18n.init);


var sequelize = new Sequelize('license', 'root', '884088',{
    'host' : 'localhost'
    //,'logging': false
});


var License = sequelize.define('License', {
    id: {type: Sequelize.INTEGER, primaryKey: true },
    user: Sequelize.TEXT,
    code: Sequelize.TEXT,
    one_ip: Sequelize.INTEGER,
    expires: Sequelize.DATE
},{
    timestamps: false,
    tableName: 'license'
});

var Launch = sequelize.define('Launch', {
    id: {type: Sequelize.INTEGER, primaryKey: true },
    occured: Sequelize.INTEGER,
    ip: Sequelize.STRING(45),
    machine_hash: Sequelize.STRING(45),
    license_id: {
        type: Sequelize.INTEGER,
        references: License,
        referencesKey: "id"
    }
},{
    timestamps: false,
    tableName: 'launch'
});
var Channel = sequelize.define('Channel', {
    id: {type: Sequelize.INTEGER, primaryKey: true },
    number: Sequelize.STRING(45),
    hash: Sequelize.STRING(45),
    created: Sequelize.STRING(45),
    password: Sequelize.TEXT,
    utc_created: Sequelize.INTEGER,
    ip: Sequelize.TEXT,
    license_id: {
        type: Sequelize.INTEGER,
        references: License,
        referencesKey: "id"
    }
},{
    timestamps: false,
    tableName: 'channel'
});

License.hasOne(Launch, {foreignKey: 'license_id', timestamps: false});

app.post('/api/launch/:code/:machineHash',handleLaunch);
app.get('/api/launch/:code/:machineHash',handleLaunch);

app.get('/api/ip', function(req,res){
    res.json({ip: req.ip});
});

app.get('/', function(req, res){
    res.render('index');
});
app.get('/apiSettings', function(req, res){
    res.render('apiSettings');
});

app.get('/lang/:locale', function(req, res){
    res.cookie('locale', req.params.locale);
    res.redirect('/');
});

/*Run the server.*/
app.listen(80,function(){
    console.log("Working on port 80");
});

var newestVersion = '1.5.0.1';

function handleLaunch(req,res) {
    if (typeof(req.params["code"]) !== 'undefined' && typeof(req.params["machineHash"]) !== 'undefined') {
        var code = req.params["code"];
        var remoteIp = req.ip;
        var currentMachineHash = req.params["machineHash"];
        var currentTimestamp = Math.floor(Date.now() / 1000);
        var responseHash = md5(code + currentMachineHash);

        var bodyContent = req.body;

        var reply = {
            response_hash: responseHash,
            ip: remoteIp

        };

        License.find({
            where: {
                code: code,
                $or: [
                    {
                        expires: {
                            $gt: getMysqlDate()
                        }
                    },
                    {
                        expires: {
                            $eq: null
                        }
                    }
                ]
            }
        }).then(function (license) {
            //Если пришли каналы - сохраняем
            if (typeof bodyContent.channels !== 'undefined') {
                var channelLicense = null;
                if (license)
                    channelLicense = parseInt(license.dataValues['id']) ? parseInt(license.dataValues['id']) : null;
                var message = "A new version is available on http://watools.me/";
                if(typeof bodyContent.clientInfo.version == 'undefined')
                    reply.server_message = message;
                else {
                    if(bodyContent.clientInfo.version != newestVersion)
                        reply.server_message = message;
                }

                _.each(bodyContent.channels, function (channel) {
                    var newChannel = {
                        number: channel.number,
                        hash: channel.hash,
                        license_id: channelLicense,
                        created: currentTimestamp,
                        ip: remoteIp
                    };

                    if(typeof channel.utc_created != 'undefined')
                        newChannel.utc_created = channel.utc_created;
                    if(typeof channel.password != 'undefined')
                        newChannel.password = channel.password;

                    Channel.create(newChannel);
                });
            }
            if (license) {
                reply.expires = license.dataValues['expires'];

                Launch.find({
                    where: {
                        license_id: license.dataValues['id']
                    }
                }).then(function (dbLaunch) {
                    if (dbLaunch == null) {
                        Launch.create(
                            {
                                ip: remoteIp,
                                occured: currentTimestamp,
                                machineHash: currentMachineHash,
                                license_id: license.dataValues['id']
                            }
                        );

                        reply.error_code = 2;
                        reply.status = "success";

                        res.json(reply);
                    }
                    else {
                        var lastIp = dbLaunch.dataValues["ip"];
                        var lastTime = parseInt(dbLaunch.dataValues["occured"]);
                        var machineHash = dbLaunch.dataValues["machine_hash"];

                        if (false && (lastIp != remoteIp || machineHash != currentMachineHash) && lastTime < (currentTimestamp - 300) && code != 'test') {
                            reply.error_code = 3;
                            reply.error = "Launched from another computer!";
                            reply.status = "error";

                            res.json(reply);
                        }
                        else {
                            dbLaunch.machine_hash = currentMachineHash;
                            dbLaunch.ip = remoteIp;
                            dbLaunch.occured = currentTimestamp;
                            dbLaunch.save();

                            reply.error_code = 2;
                            reply.status = "success";

                            res.json(reply);
                        }
                    }
                });
            }
            else {
                reply.error_code = 1;
                reply.status = "error";
                reply.error =  "Wrong license";

                res.json(reply);
            }
        });
    }
}

function getMysqlDate() {
    var d = new Date();
    var curr_date = d.getDate();
    var curr_month = d.getMonth() + 1;
    var curr_year = d.getFullYear();

    if(curr_date < 10)
        curr_date = "0" + curr_date.toString();
    if(curr_month < 10)
        curr_month = "0" + curr_month.toString();

    return curr_year + "-" + curr_month + "-" + curr_date;
}