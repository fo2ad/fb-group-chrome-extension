const getGroupId = () => document.location.pathname.replace('/groups/', '').split('/')[0];

const getPostId = () => document.location.pathname.includes('permalink') ?
    document.location.pathname
        .replace('/groups/', '')
        .split('/')
        .filter(item => !!item)
        .slice(-1)[0] : null;

const getPostText = () => document.getElementsByClassName('_5pbx userContent')[0].innerText;

const getAuthor = () => {
    const link = $('.clearfix .fwb a');
    return {
        url: link.attr('href'),
        name: link.text()
    }
};

const safeCall = (fn, defaultReturn = "") => {
    try {
        return fn();
    } catch (e) {
        console.warn(e);
        return defaultReturn;
    }
}

chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        console.log(sender.tab ?
            "from a content script:" + sender.tab.url :
            "from the extension");
        console.log(request);
        if (request.type == 'post-data')
            sendResponse({
                groupId: safeCall(getGroupId),
                postId: safeCall(getPostId),
                postText: safeCall(getPostText),
                author: safeCall(getAuthor),
                url: document.location.href
            });
    });