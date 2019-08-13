require('dotenv').config();
const config = require('../config');
const Telegram = require('../utils/telegram');

const { database } = require('./data-saver');

const start = async () => {
  try{
    config.setConfig('+989018960889', 'mellat');

    const telegram = new Telegram();

    await telegram.checkLogin();
    await database.connect();

    do{
      try{
        const dialogs = await runWithTimeout(telegram.client, 'messages.getDialogs', {
          limit: 80,
        }, undefined, 5000);

        // console.log(dialogs);

        const chatsToBeScrapped = filterChats(dialogs.chats);

        for(let i=0; i<chatsToBeScrapped.length; i++){
          try{
            const chat = chatsToBeScrapped[i];
            console.log(`${i+1} - scrapping ${chat.id}`);
            await readChats(chat, telegram.client);
          }catch(err){
            console.error(err);
            if(err.message==='timed out'){
              console.log('it was timeout, lets try again.')
              i--; //let's retry
            }
          }
        }
        break;
      }catch(err){
        console.error(err);
        if(err.message!=='timed out'){
          break;
        }
        console.log('it was timeout, lets try again.')
      }
    }while(true);
  }catch(err){
    console.error(err);
  }
  process.exit(0);
}

const mellatChannelRegEx = /[ab].+[-.].*/;
const filterChats = (chats) => {
  return chats.filter(chat => {
    return mellatChannelRegEx.test(chat.title)
  });
}

const readChats = async (chat, telegram) =>{
  const maxScrappingMessageId = await database.maxScrappingMessageId(chat.id);

  const firstDate = (new Date('2019-02-22 22:33:51.482197+03:30')).getTime() / 1000;

  let offsetId = maxScrappingMessageId ? maxScrappingMessageId : 0;
  const limit = 40;
  let count = 0;

  do {
    await sleep(1000);
    let history = await runWithTimeout(telegram, 'messages.getHistory', {
      peer: {
        _: 'inputPeerChannel',
        channel_id: chat.id,
        access_hash: chat.access_hash
      },
      offset_id: offsetId,
      limit
    }, undefined, 7000);
    let alreadySaved = 0;

    if (history.messages.length > 0) {
      for(let i=0; i<history.messages.length; i++){
        const chat_id = chat.id;
        const message_id = history.messages[i].id;
        const data = history.messages[i].message;
        const date = history.messages[i].date;
        const title = chat.title;
        const result = await database.saveData(data, title, date, chat_id, message_id);
        if(!result){
          alreadySaved++;
        }else{
          count++;
        }
        // console.log(result);
      }
      offsetId = history.messages[history.messages.length-1].id;
      await database.updateMaxScrappingMessageId(chat.id, offsetId);
    }
    if(history.messages.length === 0 || alreadySaved >= limit || history.messages[history.messages.length-1].date < firstDate ){
      await database.updateMaxScrappingMessageId(chat.id, null);
      break;
    }
  } while (true)

  console.log(`scrapped ${count} files`)

}

async function runWithTimeout(telegram, method, params, options, timeout){
  if(!timeout) timeout = 15000;
  return new Promise(function(resolve, reject) {
    telegram(method, params, options).then(result => resolve(result))
    .catch(err => reject(err));
    setTimeout(function() {
        reject(new Error('timed out'));
    }, timeout);
  });
}

async function sleep(m){
  console.log(`waiting ${m}`);
  return new Promise((resolve)=>{ setTimeout(resolve, m) });
}

start();