"use strict";

// Only load for bing.com domain
chrome.runtime.onInstalled.addListener(function(details) {
	chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
		chrome.declarativeContent.onPageChanged.addRules([{
			conditions: [
			new chrome.declarativeContent.PageStateMatcher({
				pageUrl: {
					hostEquals: "www.bing.com",
					schemes: [ "http", "https" ]
				}
			})
			],
			actions: [ new chrome.declarativeContent.ShowPageAction() ]
		}]);
	});
});

chrome.pageAction.onClicked.addListener(function(tab) {
	// Insert progress stylesheet
	chrome.tabs.insertCSS({file: "progress.css"});

	// Insert progress javascript
	chrome.tabs.executeScript({file: "progressbar.min.js"});
	chrome.tabs.executeScript({file: "progress.js"});

	var tasks = {task: 0};
	var max = 0;
	var current = 0;
	Object.observe(tasks, function(changes) {
		changes.forEach(function(change) {
			max = max < tasks.task ? tasks.task : max;
			if (current < tasks.task)
				current++;
			chrome.tabs.sendMessage(tab.id, {current: current, max: max});
			if (change.oldValue == 1 && change.object.task == 0)
				chrome.tabs.update(tab.id, {"url": tab.url});
		});
	});
	fetch("https://www.bing.com/rewardsapp/getoffers", {credentials: "include"})
	.then(function(response) {
		return response.json()
		.then(function(json) {
			if (json.ErrorDetail.ErrorCode == 0) {
				for (var i in json.Communications) {
					switch (json.Communications[i].ActivityType) {
						case "search":
							var searchParams = json.Communications[i].Message.description.match(/\d+/g);
							var totalSearches = searchParams[1] * (json.Communications[i].TicketCap - json.Communications[i].TicketProgress);
							var terms = [];
							// Get a list of search terms
							fetch("https://en.wikipedia.org/w/api.php?format=json&action=query&list=random&rnlimit=" + totalSearches, {
								headers: {
									"Api-User-Agent": chrome.app.getDetails().name + "/" + chrome.app.getDetails().version
								}
							})
							.then(function(wikiResponse) {
								return wikiResponse.json()
								.then(function(wikiJson) {
									var queries = wikiJson.query.random;
									for (var k in queries) {
										terms.push(queries[k].title);
										tasks.task++;
									}

									while (terms.length > 0) {
										// Search away
										fetch("https://www.bing.com/search?q=" + terms.shift(), {credentials: "include", method: "GET"})
										.then(function() {
											tasks.task--;
										})
										.catch(function(error) {
											console.error(error);
											tasks.task--;
										});
									}
								})
							})
							.catch(function(error) {
								console.error(error);
							});
						break;
						case "urlreward":
							// Activate the other offer links
							tasks.task++;
							fetch("https://www.bing.com" + json.Communications[i].Message.destinationurl, {method: "HEAD"})
							.then(function() {
								tasks.task--;
							})
							.catch(function(error) {
								console.error(error);
								tasks.task--;
							});
						break;
						default:
							if (json.Communications[i].CommunicationId == "captcha_1")
								chrome.tabs.update(tab.id, {url: "https://www.bing.com" + json.Communications[i].Message.destinationurl})
						break;
					}
				}
			}
		})
	})
});
