import fs from "fs";

import type { Trophy } from "psn-api";
import {
  exchangeCodeForAccessToken,
  exchangeNpssoForCode,
  getTitleTrophies,
  getUserTitles,
  getUserTrophiesEarnedForTitle,
  TrophyRarity
} from "psn-api";

async function main() {
  // 1. Authenticate and become authorized with PSN.
  // See the Authenticating Manually docs for how to get your NPSSO.
  const npssso = process.env["NPSSO"] || "";
  const accessCode = await exchangeNpssoForCode(npssso);
  const authorization = await exchangeCodeForAccessToken(accessCode);

    // 2. Get the user's `accountId` from the username.
  // const allAccountsSearchResults = await makeUniversalSearch(
  //   authorization,
  //   "UncleSev",
  //   "SocialAllAccounts"
  // );

  let sptagFile = process.argv[2]

  const targetAccountId = "me"
  // 3. Get the user's list of titles (games).
  const { trophyTitles } = await getUserTitles(authorization, targetAccountId);
  const { trophyTitles: trophyTitlesZHCN } = await getUserTitles(authorization, targetAccountId,{
        headerOverrides: {
          "Accept-Language": "zh-Hans"
        }
      });
  const { trophyTitles: trophyTitlesZHTW } = await getUserTitles(authorization, targetAccountId,{
        headerOverrides: {
          "Accept-Language": "zh-Hant"
        }
      });

  const games: any[] = [];

  if(sptagFile){
    let spTags:Array<any> = JSON.parse(fs.readFileSync(sptagFile, 'utf8'));
    for (const spTag of spTags) {
      let foundGame;
      if(spTag?.language == "zh-Hans"){
        foundGame = trophyTitlesZHCN.find(
          (t) => t.npCommunicationId === spTag?.npCommunicationId
        );
      }else if(spTag?.language == "zh-Hant"){
        foundGame = trophyTitlesZHTW.find(
          (t) => t.npCommunicationId === spTag?.npCommunicationId
        );
      }else{
        foundGame = trophyTitles.find(
          (t) => t.npCommunicationId === spTag?.npCommunicationId
        );
      }

      const foundGameZHCN = trophyTitlesZHCN.find(
        (t) => t.npCommunicationId === spTag?.npCommunicationId
      );

      const foundGameZHTW = trophyTitlesZHTW.find(
        (t) => t.npCommunicationId === spTag?.npCommunicationId
      );
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
            "Accept-Language":  spTag.language
          }
        }
      );


        // 6. Merge the two trophy lists.
        const mergedTrophies = mergeTrophyLists2(titleTrophies, earnedTrophies);

        games.push({
          gameName: foundGame?.trophyTitleName,
          gameTag: spTag?.tag,
          npCommunicationId: foundGame?.npCommunicationId,
          platform: foundGame?.trophyTitlePlatform,
          trophyTitleIconUrl: foundGame?.trophyTitleIconUrl,
          trophyTypeCounts: foundGame?.definedTrophies,
          earnedCounts: foundGame?.earnedTrophies,
          trophyList: mergedTrophies
        });
      }

      // 7. Write to a JSON file.
      fs.writeFileSync("./final_result.json", JSON.stringify(games));

  } else {


    for (const title of trophyTitles) {

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
) => {
  const mergedTrophies: any[] = [];

  for (const earnedTrophy of earnedTrophies) {
    const foundTitleTrophy = titleTrophies.find(
      (t) => t.trophyId === earnedTrophy.trophyId
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
