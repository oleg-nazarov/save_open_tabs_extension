function getTabPropsForSaving(chromeTab) {
  return {
    groupId: chromeTab.groupId,
    pinned: chromeTab.pinned,
    url: chromeTab.url,
    windowId: chromeTab.windowId,
  };
}
function getGroupPropsForSaving(group) {
  return {
    collapsed: group.collapsed,
    color: group.color,
    title: group.title,
  };
}

async function getDataForSaving(tabs) {
  const allTabData = { tabs: [], groups: {} };

  for (const tab of tabs) {
    // get tabs data
    const newTab = getTabPropsForSaving(tab);
    allTabData.tabs.push(newTab);
    
    // get groups data
    if (newTab.groupId !== -1 && !allTabData.groups[newTab.groupId]) {
      const chromeGroup = await chrome.tabGroups.get(newTab.groupId);
      allTabData.groups[newTab.groupId] = getGroupPropsForSaving(chromeGroup);
    }
  }

  return allTabData;
}

async function downloadTabData() {
  const onlyCurrentWindow = document.getElementById('current_window_id').checked;

  // prepare data
  const queryOptions = {};
  if (onlyCurrentWindow) {
    queryOptions.currentWindow = true;
  }

  const tabs = await chrome.tabs.query(queryOptions);
  const allTabData = await getDataForSaving(tabs);

  // download data
  const saver = document.createElement('a');
  saver.setAttribute('download', 'tabs.txt');
  saver.setAttribute('href', `data:text/plain,${encodeURIComponent(JSON.stringify(allTabData))}`);
  saver.click();
}

function openTabs() {
  const file = document.getElementById('open_tabs_id').files?.[0];
  const reader = new FileReader();

  if (!file) {
    throw new Error("Please select a file before clicking 'Open tabs'.");
  }

  reader.onload = () => {
    try {
      const result = reader.result;

      if (!result) {
        throw new Error("Empty file content");
      }

      const allTabData = JSON.parse(decodeURIComponent(result));

      if (!allTabData.tabs || !Array.isArray(allTabData.tabs)) {
        throw new Error(`Invalid file format: "tabs" array missing.`);
      }

      // separate tabs according to their window belongings
      const windowToTabs = allTabData.tabs.reduce((acc, tab) => {
        if (!Object.prototype.hasOwnProperty.call(acc, tab.windowId)) {
          acc[tab.windowId] = [];
        }
        acc[tab.windowId].push(tab);

        return acc;
      }, {});

      // 1. open tabs for each window
      const usedGroupIds = {};

      for (const [_, tabArray] of Object.entries(windowToTabs)) {
        chrome.windows.create({}, async (newWindow) => {
          // delete it in the end
          const emptyDefaultTab = newWindow.tabs[0];

          for (let i = 0; i < tabArray.length; ++i) {
            const tab = tabArray[i];

            const newTab = await chrome.tabs.create({
              pinned: tab.pinned,
              url: tab.url,
              windowId: newWindow.id,
            });

            // 2. add the tab to a group
            if (tab.groupId != -1) {
              const tabGroupProps = {
                tabIds: newTab.id,
                ...(Object.prototype.hasOwnProperty.call(usedGroupIds, tab.groupId)
                      ? { groupId : usedGroupIds[tab.groupId] }             // join an existing group
                      : { createProperties : { windowId: newWindow.id } }), // a new group will be created
              };

              const newGroupId = await chrome.tabs.group(tabGroupProps);
              
              // 3. update group info (color, title, collapsed)
              const groupInfo = allTabData.groups[tab.groupId];
              chrome.tabGroups.update(newGroupId, groupInfo);
              
              usedGroupIds[tab.groupId] = newGroupId;
            }
          };

          chrome.tabs.remove(emptyDefaultTab.id);
        });
      }
    } catch (error) {
      alert(`Error opening tabs: ${error.message}`);
    } finally {
      // to be able to open the same file again
      document.getElementById('open_tabs_id').value = '';
    }
  };

  reader.onerror = () => {
    console.error(`Error reading file: ${reader.error}`);
  };

  reader.readAsText(file);
}

document.getElementById('download_id').onclick = downloadTabData;
document.getElementById('open_tabs_id').onchange = openTabs;

document.getElementById('file_button_id').onclick = () => {
  document.getElementById('open_tabs_id').click();
};
