const api = typeof browser !== "undefined" ? browser : chrome;

api.runtime.onMessage.addListener((message, _sender) => {
  if (message.action === "download") {
    const files = message.files;
    return Promise.all(
      files.map((file) =>
        api.downloads.download({ url: file.url, filename: file.filename })
          .then(() => "ok")
          .catch(() => "fail")
      )
    ).then((results) => {
      const completed = results.filter((r) => r === "ok").length;
      const failed = results.filter((r) => r === "fail").length;
      return { completed, failed };
    });
  }
});
