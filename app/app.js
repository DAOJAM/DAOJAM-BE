'use strict';
const twitterStrategy = require('passport-twitter');
module.exports = app => {
    app.passport.use(new twitterStrategy({
        consumerKey:app.config.passportTwitter.key,
        consumerSecret:app.config.passportTwitter.secret,
        callbackURL: "/passport/twitter/callback"
    },(req,token,tokenSecret,profile,cb) => {
        const user = {
            provider: 'twitter',
            id: profile.id,
            name: profile.username,
            displayName: profile.displayName,
            photo: profile.photos && profile.photos[0] && profile.photos[0].value,
            token,
            tokenSecret,
            params,
            profile,
        };
        app.passport.doVerify(req,user,cb);
    }));
    app.passport.verify(async (ctx,user) => {
        const { displayName,
            name,
            photo,
            provider
          } = user;
        return await ctx.service.auth.saveTwitterUser(displayName, name, photo, ctx.clientIP, 0, provider);
    });
};