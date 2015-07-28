/* JustBot
 * an unofficial bot api for JD
 * (c) 2015 David (daXXog) Volm ><> + + + <><
 * Released under Apache License, Version 2.0:
 * http://www.apache.org/licenses/LICENSE-2.0.html  
 * --------------------------------------------------------------------------
 * some code taken from https://github.com/dooglus/jdbot/blob/master/jdbot.js
 */

/* UMD LOADER: https://github.com/umdjs/umd/blob/master/returnExports.js */
(function (root, factory) {
    if (typeof exports === 'object') {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like enviroments that support module.exports,
        // like Node.
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(factory);
    } else {
        // Browser globals (root is window)
        root.JustBot = factory();
  }
}(this, function() {
    var request = require('request'),
        S = require('string'),
        Big = require('big.js'),
        SocketClient = require('socket.io-client'),
        EventEmitter = require('events').EventEmitter,
        inherits = require('util').inherits,
        JustBot;
        
    Big.RM = 0; //round down
    Big.DP = 8; //eight decimal places as per bitcoin spec
        
    JustBot = function(optsHash) {
        var that = this;
        
        if(typeof optsHash === 'string') {
            this.hash = optsHash;
        } else if(typeof optsHash === 'object') {
            for(var opt in optsHash) {
                this[opt] = optsHash;
            }
        }
        
        setTimeout(function() { //allow time for events to be attached
            that._login();
        }, 10);
    };
    
    inherits(JustBot, EventEmitter);
    
    JustBot.ENDPOINT = 'https://just-dice.com';
    JustBot.TRANSPORT = 'websocket';
    JustBot.VERSION = '0.0.1';
    
    JustBot.prototype.error = function(err) {
        this.emit('error', err);
    };
    
    JustBot.prototype._login = function() {
        var that = this,
            jar = request.jar(),
            req = {url: JustBot.ENDPOINT, jar: jar, form: {}};
    
        if(this.hash) {
            if(this.username || this.password) {
                that.error('either specify a hash or a username and password');
            }
            
            jar.setCookie(request.cookie('hash=' + this.hash), JustBot.ENDPOINT);
        }
    
        if(this.username) {
            req.form.username = this.username;
        }
        
        if(this.password) {
            req.form.password = this.password;
        }
        
        //2FA add later: if(credentials.code)     req.form.code     = credentials.code;
    
        request.post(req, function(err, res, body) {
            if(err) {
                that.error(err);
            } else if(body.match(/Please enter your 6 digit google authentification number/)) {
                that.error('that account requires a correct 2FA code and hash to log in; 2FA codes can only be used once each');
            } else if(body.match(/Your account is set up to require a google authentification code for this action/)) {
                that.error('that account requires a 2FA code in addition to the username and password to log in');
            } else if(body.match(/Please enter your username/)) {
                that.error('that account requires a correct username and password, and possibly 2FA code; 2FA codes can only be used once each');
            } else {
                that.cookie = jar.getCookieString(JustBot.ENDPOINT);
        
                if(!that.cookie.match(/hash=/)) {
                    that.error('bad hash');
                } else {
                    that._connect(); //got a good cookie, proceed to connect
                }
            }
        });
    };
    
    JustBot.prototype._connect = function() {
        var that = this;
        
        this.socket = SocketClient(JustBot.ENDPOINT, {
            transports: [JustBot.TRANSPORT],
            extraHeaders: {
                origin: JustBot.ENDPOINT,
                cookie: this.cookie
            }
        });
        
        this.socket.on('error', function(err) {
            that.error(err);
        });
        
        this.socket.on('getver', function(key) {
            that.socket.emit('version', that.csrf, key, ['just-bot', JustBot.VERSION].join(':'));
        });
        
        this._first = true;
        
        this.socket.on('init', function(data) {
            var stamps = [],
                msgs = [];
            
            that.uid = data.uid;
            that.name = data.name;
            that.csrf = data.csrf;
            
            that.news = data.news;
            that.api = data.api;
            that.balance = new Big(data.balance);
            that.bankroll = new Big(data.bankroll);
            that.bet = new Big(data.bet);
            that.bets = new Big(data.bets);
            that.chance = new Big(data.chance);
            that.edge = new Big(data.edge);
            that.fee = new Big(data.fee);
            
            //that.ga add later
            
            that.ignores = data.ignores;
            that.investment = new Big(data.investment);
            that.invest_pft = new Big(data.invest_pft);
            that.losses = new Big(data.losses);
            that.luck = new Big(S(data.luck).replaceAll('%', '').s);
            that.max_profit = new Big(data.max_profit);
            that.news = data.news;
            that.nonce = new Big(data.nonce);
            that.offsite = new Big(data.offsite);
            that.percent = new Big(data.percent);
            that.profit = new Big(data.profit);
            that.seed = new Big(data.seed);
            that.settings = data.settings;
            that.shash = data.shash;
            that.stake_pft = new Big(data.stake_pft);
            that.username = data.username;
            that.wagered = new Big(data.wagered);
            that.wins = new Big(data.wins);
            
            that._updateStats(data);
            
            that.wdaddr = data.wdaddr;
            
            if(that._first === true) {
                that.emit('ready');
                
                data.chat.forEach(function(v, i) {
                    if((i % 2 == 0)) {
                        msgs.push(v);
                    } else {
                        stamps.push(v);
                    }
                });
                
                
                msgs.forEach(function(v, i) {
                    var chat = JSON.parse(v);
                    
                    chat.date = new Date(parseInt(stamps[i], 10));
                    
                    that.emit('chat', chat); //emit the chat backlog
                });
                
                ['news', 'balance', 'bankroll', 'max_profit', 'investment', 'percent', 'invest_pft', 'bet', 'bets', 'chance', 'nonce', 'wagered', 'balance', 'profit'].forEach(function(v) {
                    that.emit(v, that[v]);
                });
                
                
                that._first = false;
            }
            //data.chat = null;
            //console.log('init', typeof data.balance);
        });
        
        this.socket.on('chat', function(txt, date) {
            that._parseChat(txt, date);
        });
        
        this.socket.on('news', function(news) {
            that.news = news;
            that.emit('news', that.news);
        });
        
        this.socket.on('staked', function(data) {
            that.emit('staked', {
                stake_pft: new Big(data.stake_pft),
                stake_share: new Big(data.stake_share),
                stake: new Big(data.stake),
                total: new Big(data.total)
            });
        });
        
        this.socket.on('tip', function(from, name, amount, comment, ignored) {
            that.emit('tip', {
                from: from,
                name: name,
                amount: new Big(amount),
                comment: comment,
                ignored: ignored
            });
        });
        
        this.socket.on('balance', function(balance) {
            that.balance = new Big(balance);
            that.emit('balance', that.balance);
        });
        
        this.socket.on('result', function(res) {
            that._updateStats(res);
            
            ['bankroll', 'max_profit', 'investment', 'percent', 'invest_pft'].forEach(function(v) {
                that[v] = new Big(res[v]);
                that.emit(v, that[v]);
            });
            
            if(res.uid === that.uid) {
                ['bet', 'bets', 'chance', 'nonce', 'wagered', 'balance', 'profit'].forEach(function(v) {
                    that[v] = new Big(res[v]);
                    that.emit(v, that[v]);
                });
                
                that.luck = new Big(S(res.luck).replaceAll('%', '').s);
                that.emit('result', res);
            }
        });
    };
    
    JustBot.prototype._updateStats = function(data) {
        this.stats = {
            bets: new Big(data.stats.bets),
            profit: new Big(data.stats.profit),
            wins: new Big(data.stats.wins),
            losses: new Big(data.stats.losses),
            purse: new Big(data.stats.purse),
            commission: new Big(data.stats.commission),
            wagered: new Big(data.stats.wagered),
            luck: new Big(data.stats.luck),
            cold: new Big(data.stats.cold),
            balance: new Big(data.stats.balance),
            sum1: new Big(data.stats.sum1),
            sum2: new Big(data.stats.sum2),
            taken: new Big(data.stats.taken)
        };
        
        this.emit('stats', this.stats);
    };
    
    JustBot.prototype.chat = function(txt) {
        this.socket.emit('chat', this.csrf, txt);
    };
    
    JustBot.prototype.msg = function(uid, txt) {
        this.chat(['/msg', uid, txt].join(' '));
    };
    
    JustBot.prototype.tip = function(uid, amount, priv) {
        this.chat(['/tip', 'noconf', priv ? 'private' : '', uid, JustBot._tidy(amount)].join(' '));
    };
    
    JustBot.prototype.roll = function(chance, stake, high) {
        this.socket.emit('bet', this.csrf, {chance: JustBot._tidy(chance, 4), bet: JustBot._tidy(stake), which: high ? 'hi' : 'lo'});
    };
    
    JustBot.prototype._parseChat = function(txt, date) {
        var s, ss, sx, ssx, user, name, header, t, me;
        
        if(S(txt).startsWith('(')) {
            s = txt.split(')');
            ss = s[1].split('>');
            
            sx = s[0].split('');
            ssx = ss[0].split('');
            
            if(ssx[1] === '*') {
                s = txt.split(') *');
                ss = s[1].split('>');
            
                sx = s[0].split('');
                ssx = ss[0].split('');
                
                me = true;
            }
            
            sx.shift();
            ssx.shift();
            ssx.shift();
            
            user = sx.join('');
            name = ssx.join('');
            
            if(me === true) {
                header = ['(', user,  ') * <', name, '> '].join('');
            } else {
                header = ['(', user,  ') <', name, '> '].join('');
            }
            
            t = txt.split(header);
            t.shift(); //remove first header
            t = t.join(header); //put back the string if needed
            
            if(user !== this.uid) {
                this.emit(me ? 'me' : 'chat', { // to me or not to me thats the question
                    user: user,
                    name: name,
                    txt: t,
                    date: new Date(date)
                });
            }
        } else if(S(txt).startsWith('[')) { //private message
            s = txt.split(')');
            ss = s[1].split('>');
            
            sx = s[0].split('');
            ssx = ss[0].split('');
            
            sx.shift();
            sx.shift();
            sx.shift();
            ssx.shift();
            ssx.shift();
            
            user = sx.join('');
            name = ssx.join('');
            
            header = ['[ (', user, ') <', name, '> → (', this.uid, ') <', this.name, '> ] '].join('');
            t = txt.split(header);
            t.shift(); //remove first header
            t = t.join(header); //put back the string if needed
            
            if(user !== this.uid) {
                this.emit('msg', {
                    user: user,
                    name: name,
                    txt: t,
                    date: new Date()
                });
            }
        } else if(S(txt).startsWith('INFO: ')) { //INFO message
            header = 'INFO: ';
            t = txt.split(header);
            t.shift(); //remove first header
            t = t.join(header); //put back the string if needed
            
            this.emit('info', t);
        } else {
            this.error('unparseable message ' + txt);
            return false;
        } 
    };
    
    JustBot.prettyChat = function(msg) {
        return [[('0' + msg.date.getHours()).slice(-2), ('0' + msg.date.getMinutes()).slice(-2), ('0' + msg.date.getSeconds()).slice(-2)].join(':'), ' (', msg.user, ') <', msg.name, '> ', msg.txt].join('');
    };
    
    JustBot.prettyStake = function(stake) {
        var ourstake = (stake.stake_pft.toString() === '0') ? '; your share = ' + JustBot._tidy(stake.stake_share) + '; your total = ' + JustBot._tidy(stake.stake_pft) + '' : '';
        return 'STAKED: we just staked', JustBot._tidy(stake.stake), '(total =', JustBot._tidy(stake.total) + ourstake + ')';
    };
    
    JustBot._tidy = function(val, fixed) {
        if (fixed === undefined) {
            fixed=8;
        }
        
        if(typeof val.toFixed === 'function') {
            val = val.toFixed(fixed);
        }
        
        val = val.replace(/([.].*?)0+$/, '$1'); // remove trailing zeroes after the decimal point
        val = val.replace(/[.]$/, '');          // remove trailing decimal point
        
        return val;
    };
    
    return JustBot;
}));
