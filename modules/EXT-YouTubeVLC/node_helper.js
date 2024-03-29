/** EXT-YouTubeVLC helper **/

"use strict"
var NodeHelper = require("node_helper")
const fs = require("fs")
const path = require("path")
let log = () => { /* do nothing */ }

module.exports = NodeHelper.create({
  start: function () {
    console.log("[YT] " + require('./package.json').name + " Version:", require('./package.json').version , "rev:", require('./package.json').rev)
    this.config = {}
    this.Lib = []
    this.searchInit = false
    this.YouTube = null
    this.YT = 0
  },

  socketNotificationReceived: function (notification, payload) {
    switch(notification) {
      case "INIT":
        this.config = payload
        this.initialize()
        break
      case "YT_SEARCH":
        this.YoutubeSearch(payload)
        break
      case "YT_PLAY":
        this.playWithVlc(this.YouTubeLink(payload))
        break
      case "YT_CLOSE":
        this.CloseVlc()
        break
      case "YT_VOLUME":
        this.VolumeVLC(payload)
        break
    }
  },

  initialize: async function() {
    if (this.config.debug) log = (...args) => { console.log("[YT]", ...args) }
    log("Starting YouTubeVLC module...")
    log("Config:", this.config)

    let bugsounet = await this.loadBugsounetLibrary()
    if (bugsounet) {
      console.error("[YT] Warning:", bugsounet, "library not loaded !")
      console.error("[YT] Try to solve it with `npm install` in EXT-YouTubeVLC directory")
      return
    }
    else {
      console.log("[YT] All needed library loaded !")
      log("Library:", this.Lib)
    }

    if (this.config.useSearch) {
      log("Check credentials.json...")
      if (fs.existsSync(__dirname + "/credentials.json")) {
        this.config.CREDENTIALS = __dirname + "/credentials.json"
      } else {
        if(fs.existsSync(path.resolve(__dirname + "/../MMM-GoogleAssistant/credentials.json"))) {
         this.config.CREDENTIALS = path.resolve(__dirname + "/../MMM-GoogleAssistant/credentials.json")
        }
      }
      if (!this.config.CREDENTIALS) {
        this.sendSocketNotification("YT_CREDENTIALS_MISSING")
        return console.log("[YT] credentials.json file not found !")
      }
      else log("credentials.json found in", this.config.CREDENTIALS)

      try {
        var CREDENTIALS = this.Lib.readJson(this.config.CREDENTIALS)
        CREDENTIALS = CREDENTIALS.installed || CREDENTIALS.web
        const TOKEN = this.Lib.readJson(__dirname + "/tokenYT.json")
        let oauth = this.Lib.YouTubeAPI.authenticate({
          type: "oauth",
          client_id: CREDENTIALS.client_id,
          client_secret: CREDENTIALS.client_secret,
          redirect_url: CREDENTIALS.redirect_uris,
          access_token: TOKEN.access_token,
          refresh_token: TOKEN.refresh_token
        })
        console.log("[YT] YouTube Search Function initilized.")
        this.searchInit = true
        this.sendSocketNotification("YT_SEARCH_INITIALIZED")
      } catch (e) {
        this.sendSocketNotification("YT_TOKEN_MISSING")
        console.error("[FATAL] YouTube: tokenYT.json file not found !")
        console.error("[YT] " + e)
        return
      }
    }
    console.log("[YT] EXT-YouTubeVLC is Ready.")
  },

  /** Load require @busgounet library **/
  /** It will not crash MM (black screen) **/
  loadBugsounetLibrary: function() {
    let libraries= [
      // { "library to load" : [ "store library name", "path to check" ] }
      { "youtube-api": [ "YouTubeAPI", "useSearch"] },
      { "he": [ "he", "useSearch" ] },
      { "r-json": [ "readJson","useSearch" ] },
      { "@bugsounet/cvlc": [ "cvlc", "maxVolume" ] }
    ]

    let errors = 0
    return new Promise(resolve => {
      libraries.forEach(library => {
        for (const [name, configValues] of Object.entries(library)) {
          let libraryToLoad = name,
              libraryName = configValues[0],
              libraryPath = configValues[1],
              index = (obj,i) => { return obj[i] }

          // libraryActivate: verify if the needed path of config is activated (result of reading config value: true/false) **/
          let libraryActivate = libraryPath.split(".").reduce(index,this.config) 
          if (libraryActivate) {
            try {
              if (!this.Lib[libraryName]) {
                this.Lib[libraryName] = require(libraryToLoad)
                log("Loaded:", libraryToLoad)
              }
            } catch (e) {
              this.sendSocketNotification("YT_LIBRARY_ERROR", libraryToLoad)
              console.error("[YT]", libraryToLoad, "Loading error!" , e)
              errors++
            }
          }
        }
      })
      resolve(errors)
    })
  },

  /** YouTube Search **/
  YoutubeSearch: async function (query) {
    log("Search for:", query)
    try {
      var results = await this.Lib.YouTubeAPI.search.list({q: query, part: 'snippet', maxResults: 1, type: "video"})
      var item = results.data.items[0]
      var title = this.Lib.he.decode(item.snippet.title)
      log('Found YouTube Title: %s - videoId: %s', title, item.id.videoId)
      this.sendSocketNotification("YT_FOUND", { title: title, id: item.id.videoId })
    } catch (e) {
      console.error("[YT] YouTube Search error:", e.toString())
      this.sendSocketNotification("YT_SEARCH_ERROR")
    }
  },

  /** youtube control with VLC **/
  playWithVlc: function (link) {
    this.YT++
    if (this.YouTube) this.CloseVlc()
    this.YouTube = new this.Lib.cvlc()
    this.YouTube.play(
      link,
      ()=> {
        log("Found link:", link)
         if (this.YouTube) this.YouTube.cmd("volume "+ this.config.maxVolume)
      },
      ()=> {
        this.YT--
        if (this.YT < 0) this.YT = 0
        log("Video ended #" + this.YT)
        if (this.YT == 0) {
          log("Finish !")
          this.sendSocketNotification("YT_FINISH")
          this.YouTube = null
        }
      }
    )
  },

  CloseVlc: function () {
    if (this.YouTube) {
      log("Force Closing VLC...")
      this.YouTube.destroy()
      this.YouTube = null
      log("Done Closing VLC...")
    }
    else {
      log("Not running!")
    }
  },

  VolumeVLC: function(volume) {
    if (this.YouTube) {
      log("Set VLC Volume to:", volume)
      this.YouTube.cmd("volume " + volume)
    }
  },

  YouTubeLink: function (id) {
    let link= "https://www.youtube.com/watch?v=" + id
    return link
  },
})
