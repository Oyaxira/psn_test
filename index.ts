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
  TrophyRarity
} from "psn-api";
import { findConfigFile } from "typescript";
import * as _ from "lodash";

interface PsnConfig {
  npsso: string;
  target: string;
}

async function main() {
  console.log("test");
  // 1. Authenticate and become authorized with PSN.
  // See the Authenticating Manually docs for how to get your NPSSO.
  let configFile = process.argv[2]
  let config: PsnConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  const npssso = config.npsso || "";
  const target = config.target || "";
  const accessCode = await exchangeNpssoForCode(npssso);
  const authorization = await exchangeCodeForAccessToken(accessCode);

  let targetAccountId = "me"
  if (target !== "me") {
    const allAccountsSearchResults = await makeUniversalSearch(
      authorization,
      target,
      "SocialAllAccounts"
    );
    targetAccountId =
      allAccountsSearchResults.domainResponses[0].results[0].socialMetadata
        .accountId;
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
          (t) => t.npCommunicationId === spTag?.npCommunicationId
        );
      } else if (spTag?.language == "zh-Hant") {
        foundGame = trophyTitlesZHTW.find(
          (t) => t.npCommunicationId === spTag?.npCommunicationId
        );
      } else {
        foundGame = trophyTitles.find(
          (t) => t.npCommunicationId === spTag?.npCommunicationId
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
      const mergedTrophies = mergeTrophyLists2(titleTrophies, earnedTrophies, trophyGroups);
      let filterdEnenedTrohpy = earnedTrophies.filter((t) => t.earned);
      _.sortBy(filterdEnenedTrohpy, ['earnedDateTime'])
      let lastEnenedTrohpy = filterdEnenedTrohpy[filterdEnenedTrohpy.length - 1];
      let firstEnenedTrohpy = filterdEnenedTrohpy[0];
      let lastTime = lastEnenedTrohpy?.earnedDateTime;
      let firstTime = firstEnenedTrohpy?.earnedDateTime;


      games.push({
        gameName: foundGame?.trophyTitleName,
        gameTag: spTag?.tag,
        npCommunicationId: foundGame?.npCommunicationId,
        platform: foundGame?.trophyTitlePlatform,
        trophyTitleIconUrl: foundGame?.trophyTitleIconUrl,
        trophyTypeCounts: foundGame?.definedTrophies,
        earnedCounts: foundGame?.earnedTrophies,
        lastEnenedTime: lastTime,
        firstEnenedTime: firstTime,
        trophyList: mergedTrophies
      });
    }

    // 7. Write to a JSON file.
    fs.writeFileSync("./final_result.json", JSON.stringify(games));

  } else {


    for (const title of trophyTitles) {

      console.log(`Processing ${title.trophyTitleName}`)

      const foundGameZHCN = trophyTitlesZHCN.find(
        (t) => t.npCommunicationId === title.npCommunicationId
      );

      const foundGameZHTW = trophyTitlesZHTW.find(
        (t) => t.npCommunicationId === title.npCommunicationId
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
    fs.writeFileSync("./result.json", JSON.stringify(games));
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
      (t) => t.trophyId === earnedTrophy.trophyId
    );

    const foundTitleTrophyHant = titleTrophiesHant.find(
      (t) => t.trophyId === earnedTrophy.trophyId
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
  trophyGroups: any[],
) => {
  const mergedTrophies: any[] = [];

  for (const earnedTrophy of earnedTrophies) {
    const foundTitleTrophy = titleTrophies.find(
      (t) => t.trophyId === earnedTrophy.trophyId
    );

    mergedTrophies.push(normalizeTrophy2({ ...earnedTrophy, ...foundTitleTrophy }, trophyGroups));
  }

  return mergedTrophies;
};

const normalizeTrophy2 = (trophy: Trophy, trophyGroups: any[]) => {
  let trophyGroup = trophyGroups.find((t) => {
    return t.trophyGroupId == trophy.trophyGroupId
  }) || {}
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
    trophyGroupName: trophyGroup?.trophyGroupName,
    trophyGroupIconUrl: trophyGroup?.trophyGroupIconUrl,
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
