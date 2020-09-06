class Regex {
    getPathAndQuery(url) {
        return url.match(/(?:https?:\/\/)?(?:[^\/]*)([^\s]*)/)[1];
    }

    getPath(url) {
        return url.match(/(?:https?:\/\/)?(?:[^\/]*)([^?]*)/)[1];
    }

    getEndpoint(url) {
        return url.match(/([^\/?]*)(?:\?[^?]*)?$/)[1];
    }

    getSegments(path) {
        return path.match(/(?<=\/)([^\/?])+/g);
    }

    removeQuery(url) {
        return url.match(/[^?]+/)[0];
    }
}

module.exports = new Regex();