const MAIN_POST_ID = 332585143754045;
const MAX_CONCURRENT_TABS = 1;
let acitveTabs = 0;

const parseMainPost = (post) => {
    const lines =   post.split('\n');
    const indexes = lines
        .map((line, index) => !isNaN(+line[0]) && line.length > 1 ? index : null )
        .filter(item => !!item);
    indexes.push(lines.length - 1);
    const cats = [];
    for (let i = 0; i < indexes.length; i++ ) {
        const index = indexes[i];
        const name = lines[index];
        const links = lines.slice(index, indexes[i+1])
            .map(ls => ls.split(' ').map(l => l.trim()))
            .reduce((items, current, index) => [...items, ...current], [])
            .filter(link => link.indexOf('https') === 0);
        cats.push({
            name,
            links
        })
    }
    return cats.filter(cat => !!cat.name && cat.links.length);
};

const saveToSpreadSheet = (token, spreadsheetId, range, values) => {
    const url =`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;
    const body = {
        range: range,
        "majorDimension": "ROWS",
        "values": values,
    };

    fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `OAuth ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    }).then(response => response.json())
        .then(json => console.log(json));

};

const addSheet = (token, spreadSheetId, title) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadSheetId}:batchUpdate`;
    const body = {
        requests: [
            {
                addSheet: {
                    properties: {
                        title: title
                    }
                }
            }
        ]
    };
    return fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `OAuth ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    }).then(response => response.json())
};

const getSheet = (token, sheetId) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;

    return fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `OAuth ${token}`,
            'Content-Type': 'application/json'
        },
    })
        .then(response => response.json())
};

const getFBPost = (fbToken, postId) => {
     const url = `https://graph.facebook.com/v2.9/${postId}`;
    return fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `OAuth ${fbToken}`,
            'Content-Type': 'application/json'
        },
    })
        .then(response => response.json())
};

const saveMainPost = (token, sheetId, sheet, cats) => {
    const sheets = sheet.sheets.map(sheet => sheet.properties.title);
    const categoriesMap = {};
    const promises = cats.map(
        cat => {
            let addSheetPromise;
            if(!sheets.includes(cat.name)) {
                addSheetPromise = addSheet(token, sheetId, cat.name)
                    .then(response => response.replies.map(reply => reply.addSheet));

            } else {
                addSheetPromise = Promise.resolve(
                    sheet.sheets.filter(sheet => sheet.properties.title === cat.name)
                )
            }
            return addSheetPromise.then(sheet => {
                const item = {
                    category: cat,
                    sheet
                };
                categoriesMap[cat.name] = item;
                return item;
            });
        }
    );
    Promise.all(promises).then(
        (items) => saveCategories(categoriesMap, (cat, link, {postId = "", postText = "", author = ""} = {}) => {
            saveToSpreadSheet(token, sheetId, `${cat.name}!A:E`, [[
                postId, author.name, author.url, link, postText
            ]])
        })
    )
};

const checkRecordExistence = (token, sheetId, postId) => {

};

const saveCategories = (categoriesMap, cb) => {
    Object.keys(categoriesMap).forEach(
        key => {
            const { category } = categoriesMap[key];
            category.links.forEach(link => getAndSaveLink(link, data => cb(category, link, data)));
        }
    )
};

const getAndSaveLink = (link, cb) => {
    if (acitveTabs < MAX_CONCURRENT_TABS) {
        acitveTabs++;
        openLink(link, cb);
    } else {
        setTimeout(() => getAndSaveLink(link, cb), 1000);
    }
};

openLink = (link, cb) => {
    chrome.tabs.create({
        url: link,
        active: false
    }, tab => {
        parseTab(tab, cb)
    })
};

parseTab = (tab, cb) => {
    if (tab.status === 'loading'){
        setTimeout(() => chrome.tabs.query({url: tab.url}, tabs => parseTab(tabs[0], cb)), 1000);
    } else {
        chrome.tabs.sendMessage(tab.id, {type: 'post-data'}, response => {
            cb(response);
            setTimeout(() => chrome.tabs.remove(tab.id, () => acitveTabs--));
        });
    }
};


$(() => {
    $("#btn_submit").on('click', e => {
        // Array of API discovery doc URLs for APIs used by the quickstart
        const DISCOVERY_DOCS = ["https://sheets.googleapis.com/$discovery/rest?version=v4"];

        // Authorization scopes required by the API; multiple scopes can be
        // included, separated by spaces.
        const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
        const FB_SCOPES = 'user_posts';

        const googleAuth = new OAuth2('google', Object.assign({}, googleClient, {api_scope: SCOPES}));
        const fbAuth = new OAuth2('facebook', Object.assign({}, fbClient, {api_scope: FB_SCOPES}));

        googleAuth.authorize(function() {
            // Ready for action, can now make requests with
            const token = googleAuth.getAccessToken();

            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {type: 'post-data'}, function(response) {

                    const { postId } = response;
                    getSheet(token, SPREAD_SHEET)
                        .then(sheet => {
                            if (+postId === MAIN_POST_ID) {
                                const cats = parseMainPost(response.postText);
                                saveMainPost(token, SPREAD_SHEET, sheet, cats);
                            } else {
                                // savePost(token, SPREAD_SHEET, sheet, )
                            }
                        });
                });
            });

        })
    });
});