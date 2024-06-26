import fs from "fs";

import type { Trophy, TrophyTitle } from "psn-api";
import {
  exchangeCodeForAccessToken,
  exchangeNpssoForCode,
  getTitleTrophies,
  getUserTitles,
  makeUniversalSearch,
  getUserTrophiesEarnedForTitle,
  getTitleTrophyGroups,
  TrophyRarity,
  getProfileFromUserName
} from "psn-api";
import { findConfigFile } from "typescript";
import * as _ from "lodash";

interface PsnConfig {
  npsso: string;
  target: string;
  output_path: string;
}

async function main() {
  console.log("test");
  // 1. Authenticate and become authorized with PSN.
  // See the Authenticating Manually docs for how to get your NPSSO.
  let configFile = process.argv[2]
  let config: PsnConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  const npssso = config.npsso || "";
  const target = config.target || "";
  const output_path = config.output_path || "./";
  const accessCode = await exchangeNpssoForCode(npssso);
  const authorization = await exchangeCodeForAccessToken(accessCode);

  let targetAccountId = "me"
  let userName = ''
  if (target !== "me") {
    const allAccountsSearchResults = await makeUniversalSearch(
      authorization,
      target,
      "SocialAllAccounts"
    );
    targetAccountId =
      allAccountsSearchResults.domainResponses[0].results[0].socialMetadata
        .accountId;
    userName = allAccountsSearchResults.domainResponses[0].results[0].socialMetadata.onlineId;
  }
  if (userName) {
    let result = await getProfileFromUserName(authorization, userName);
    let is_plus = result?.profile?.plus === 1;
    let trophySummary = result?.profile?.trophySummary;
    let userData = {
      is_plus: is_plus,
      trophySummary: trophySummary,
      userName: userName,
      accountId: targetAccountId,
    }
    fs.writeFileSync(`${output_path}/profile.json`, JSON.stringify(userData));
  }

  let sptagFile = process.argv[3]

  let per = 50;
  let page = 0;
  let total = 50;
  let trophyTitles: TrophyTitle[] = []
  let trophyTitlesZHCN: TrophyTitle[] = []
  let trophyTitlesZHTW: TrophyTitle[] = []

  while (per * page <= total) {
    page++;
    let { trophyTitles: trophyTitlesEN, totalItemCount } = await getUserTitles(authorization, targetAccountId, {
      limit: per,
      offset: per * (page - 1)
    });
    total = totalItemCount;
    console.log(`Processing page ${page} of ${Math.ceil(total / per)}`);
    let { trophyTitles: trophyTitlesCN } = await getUserTitles(authorization, targetAccountId, {
      headerOverrides: {
        "Accept-Language": "zh-Hans"
      },
      limit: per,
      offset: per * (page - 1)
    });
    console.log(`ProcessingCN page ${page} of ${Math.ceil(total / per)}`);
    let { trophyTitles: trophyTitlesTW } = await getUserTitles(authorization, targetAccountId, {
      headerOverrides: {
        "Accept-Language": "zh-Hant"
      },
      limit: per,
      offset: per * (page - 1)
    });
    console.log(`ProcessingTW page ${page} of ${Math.ceil(total / per)}`);

    trophyTitles = trophyTitles.concat(trophyTitlesEN);
    trophyTitlesZHCN = trophyTitlesZHCN.concat(...trophyTitlesCN);
    trophyTitlesZHTW = trophyTitlesZHTW.concat(...trophyTitlesTW);
  }

  console.log(`Total titles: ${trophyTitles.length}`);

  // 3. Get the user's list of titles (games).


  const games: any[] = [];

  if (sptagFile) {
    let spTags: Array<any> = JSON.parse(fs.readFileSync(sptagFile, 'utf8'));
    for (const spTag of spTags) {
      let foundGame;
      if (spTag?.language == "zh-Hans") {
        foundGame = trophyTitlesZHCN.find(
          (t) => t?.npCommunicationId === spTag?.npCommunicationId
        );
      } else if (spTag?.language == "zh-Hant") {
        foundGame = trophyTitlesZHTW.find(
          (t) => t?.npCommunicationId === spTag?.npCommunicationId
        );
      } else {
        foundGame = trophyTitles.find(
          (t) => t?.npCommunicationId === spTag?.npCommunicationId
        );
      }
      console.log(`Processing ${foundGame?.trophyTitleName} ${spTag?.language}`)

      const { trophies: titleTrophies } = await getTitleTrophies(
        authorization,
        spTag.npCommunicationId,
        "all",
        {
          npServiceName:
            foundGame?.trophyTitlePlatform !== "PS5" ? "trophy" : undefined,
          headerOverrides: {
            "Accept-Language": spTag.language
          }
        }
      );


      // 5. Get the list of _earned_ trophies for each of the user's titles.
      const { trophies: earnedTrophies } = await getUserTrophiesEarnedForTitle(
        authorization,
        targetAccountId,
        spTag.npCommunicationId,
        "all",
        {
          npServiceName:
            foundGame?.trophyTitlePlatform !== "PS5" ? "trophy" : undefined,
          headerOverrides: {
            "Accept-Language": spTag.language
          }
        }
      );

      const { trophyGroups } = await getTitleTrophyGroups(
        authorization,
        spTag.npCommunicationId,
        {
          npServiceName:
            foundGame?.trophyTitlePlatform !== "PS5" ? "trophy" : undefined,
          headerOverrides: {
            "Accept-Language": spTag.language
          }
        });
      // 6. Merge the two trophy lists.
      const mergedTrophies = mergeTrophyLists2(titleTrophies, earnedTrophies);
      let filterdEnenedTrohpy = earnedTrophies.filter((t) => t?.earned);
      _.sortBy(filterdEnenedTrohpy, ['earnedDateTime'])
      let lastEnenedTrohpy = filterdEnenedTrohpy[filterdEnenedTrohpy.length - 1];
      let firstEnenedTrohpy = filterdEnenedTrohpy[0];
      let lastTime = lastEnenedTrohpy?.earnedDateTime;
      let firstTime = firstEnenedTrohpy?.earnedDateTime;


      games.push({
        gameName: spTag?.displayName || foundGame?.trophyTitleName,
        gameTag: spTag?.tag,
        customizedName: spTag?.customizedName || "",
        npCommunicationId: foundGame?.npCommunicationId,
        platform: foundGame?.trophyTitlePlatform,
        trophyTitleIconUrl: foundGame?.trophyTitleIconUrl,
        trophyTypeCounts: foundGame?.definedTrophies,
        earnedCounts: foundGame?.earnedTrophies,
        lastEnenedTime: lastTime,
        firstEnenedTime: firstTime,
      });
      let trophyGroupData = trophyGroups.map((trophyGroup) => {
        let resultData: any = { ...trophyGroup }
        resultData.trophies = mergedTrophies.filter((t) => t?.groupId == trophyGroup.trophyGroupId);
        let trophyTypeCounts = {
          bronze: resultData.trophies.filter((t: { type: string; }) => t?.type == "bronze").length,
          silver: resultData.trophies.filter((t: { type: string; }) => t?.type == "silver").length,
          gold: resultData.trophies.filter((t: { type: string; }) => t?.type == "gold").length,
          platinum: resultData.trophies.filter((t: { type: string; }) => t?.type == "platinum").length
        }
        let earnedCounts = {
          bronze: resultData.trophies.filter((t: { isEarned: any; type: string; }) => t?.isEarned && t?.type == "bronze").length,
          silver: resultData.trophies.filter((t: { isEarned: any; type: string; }) => t?.isEarned && t?.type == "silver").length,
          gold: resultData.trophies.filter((t: { isEarned: any; type: string; }) => t?.isEarned && t?.type == "gold").length,
          platinum: resultData.trophies.filter((t: { isEarned: any; type: string; }) => t?.isEarned && t?.type == "platinum").length
        }
        resultData.earnedCounts = earnedCounts
        resultData.trophyTypeCounts = trophyTypeCounts
        delete resultData.definedTrophies
        return resultData
      });

      fs.mkdirSync(`${output_path}/details`, { recursive: true });
      fs.writeFileSync(`${output_path}/details/${foundGame?.npCommunicationId}.json`, JSON.stringify(trophyGroupData));

    }

    // 7. Write to a JSON file.
    fs.writeFileSync(`${output_path}/gamelist.json`, JSON.stringify(games));

  } else {


    for (const title of trophyTitles) {

      console.log(`Processing ${title.trophyTitleName}`)

      const foundGameZHCN = trophyTitlesZHCN.find(
        (t) => t?.npCommunicationId === title.npCommunicationId
      );

      const foundGameZHTW = trophyTitlesZHTW.find(
        (t) => t?.npCommunicationId === title.npCommunicationId
      );


      // 4. Get the list of trophies for each of the user's titles.
      const { trophies: titleTrophies } = await getTitleTrophies(
        authorization,
        title.npCommunicationId,
        "all",
        {
          npServiceName:
            title.trophyTitlePlatform !== "PS5" ? "trophy" : undefined,
          headerOverrides: {
            "Accept-Language": "zh-Hans"
          }
        }
      );

      const { trophies: titleTrophiesHant } = await getTitleTrophies(
        authorization,
        title.npCommunicationId,
        "all",
        {
          npServiceName:
            title.trophyTitlePlatform !== "PS5" ? "trophy" : undefined,
          headerOverrides: {
            "Accept-Language": "zh-Hant"
          }
        }
      );

      // 5. Get the list of _earned_ trophies for each of the user's titles.
      const { trophies: earnedTrophies } = await getUserTrophiesEarnedForTitle(
        authorization,
        targetAccountId,
        title.npCommunicationId,
        "all",
        {
          npServiceName:
            title.trophyTitlePlatform !== "PS5" ? "trophy" : undefined,
          headerOverrides: {
            "Accept-Language": "zh-Hans"
          }
        }
      );

      // 6. Merge the two trophy lists.
      const mergedTrophies = mergeTrophyLists(titleTrophies, earnedTrophies, titleTrophiesHant);

      games.push({
        gameName: title.trophyTitleName,
        gameNameHans: foundGameZHCN?.trophyTitleName,
        gameNameHant: foundGameZHTW?.trophyTitleName,
        npCommunicationId: title.npCommunicationId,
        platform: title.trophyTitlePlatform,
        trophyTitleIconUrl: title.trophyTitleIconUrl,
        trophyTypeCounts: title.definedTrophies,
        earnedCounts: title.earnedTrophies,
        trophyList: mergedTrophies
      });
    }

    // 7. Write to a JSON file.
    fs.writeFileSync(`${output_path}/result.json`, JSON.stringify(games));
  }


}

const mergeTrophyLists = (
  titleTrophies: Trophy[],
  earnedTrophies: Trophy[],
  titleTrophiesHant: Trophy[],
) => {
  const mergedTrophies: any[] = [];

  for (const earnedTrophy of earnedTrophies) {
    const foundTitleTrophy = titleTrophies.find(
      (t) => t?.trophyId === earnedTrophy.trophyId
    );

    const foundTitleTrophyHant = titleTrophiesHant.find(
      (t) => t?.trophyId === earnedTrophy.trophyId
    );


    mergedTrophies.push(normalizeTrophy({ ...earnedTrophy, ...foundTitleTrophy }, { ...earnedTrophy, ...foundTitleTrophyHant }));
  }

  return mergedTrophies;
};

const normalizeTrophy = (trophy: Trophy, hantTrophy: Trophy) => {
  return {
    isEarned: trophy.earned ?? false,
    earnedOn: trophy.earned ? trophy.earnedDateTime : "unearned",
    type: trophy.trophyType,
    rarity: rarityMap[trophy.trophyRare ?? 0],
    trophyIconUrl: trophy.trophyIconUrl,
    trophyDetail: trophy.trophyDetail,
    trophyDetailHant: hantTrophy.trophyDetail,
    earnedRate: Number(trophy.trophyEarnedRate),
    trophyName: trophy.trophyName,
    trophyNameHant: hantTrophy.trophyName,
    trophyHidden: trophy.trophyHidden,
    groupId: trophy.trophyGroupId
  };
};



const mergeTrophyLists2 = (
  titleTrophies: Trophy[],
  earnedTrophies: Trophy[],
) => {
  const mergedTrophies: any[] = [];

  for (const earnedTrophy of earnedTrophies) {
    const foundTitleTrophy = titleTrophies.find(
      (t) => t?.trophyId === earnedTrophy.trophyId
    );

    mergedTrophies.push(normalizeTrophy2({ ...earnedTrophy, ...foundTitleTrophy }));
  }

  return mergedTrophies;
};

const normalizeTrophy2 = (trophy: Trophy) => {
  return {
    isEarned: trophy.earned ?? false,
    earnedOn: trophy.earned ? trophy.earnedDateTime : "unearned",
    type: trophy.trophyType,
    rarity: rarityMap[trophy.trophyRare ?? 0],
    trophyIconUrl: trophy.trophyIconUrl,
    trophyDetail: trophy.trophyDetail,
    earnedRate: Number(trophy.trophyEarnedRate),
    trophyName: trophy.trophyName,
    trophyHidden: trophy.trophyHidden,
    groupId: trophy.trophyGroupId
  };
};


const rarityMap: Record<TrophyRarity, string> = {
  [TrophyRarity.VeryRare]: "Very Rare",
  [TrophyRarity.UltraRare]: "Ultra Rare",
  [TrophyRarity.Rare]: "Rare",
  [TrophyRarity.Common]: "Common"
};

main();
