var m = angular.module('exportLinkServices',
['translationService','ngRoute','valueServices','itemService']);

m.factory('exportLinkHelper', 
['$http','items','dntData','createItem','initItem','hCodeValues','itemColumnsToLoad','statHelper','translations',
function($http,items,dntData,createItem,initItem,hCodeValues,itemColumnsToLoad,statHelper,translations) {
  'use strict';
  
  return {
    
    encodeItem: function(item) {
      if(item != null) {
        var itemString;

        if(item.typeName == 'custom')  {
          itemString = '_custom';
          angular.forEach(item.stats, function(stat, index) {
            if(index > 0) {
              itemString += '|';
            }
            else {
              itemString += ':C'
            }
            itemString += stat.id.toString(36) + '=' + stat.max;
          });
        }
        else if(item.id) {
          itemString = 'I' + item.id.toString(36) + ':_';
          if('itemSource' in item) {
            itemString += item.itemSource;
          }
          else if('itemTypeName' in item) {
            // this is to support groups saved with the old property name
            itemString += item.itemTypeName;
          }
        
          if(item.enchantmentNum || item.enchantmentNum == 0) {
            itemString += ':E' + item.enchantmentNum.toString(36);
          }
          if(item.pid > 0) {
            itemString += ':P' + item.pid.toString(36);
          }
          // if(item.setId > 0) {
            // itemString += ':S' + item.setId.toString(36);
          // }
          if(item.sparkId > 0) {
            itemString += ':H' + item.sparkId.toString(36);
          }
          if(item.typeName == 'skills') {
            itemString += ':J' + item.baseJobName;
          }
        }
        
        if(item.name) {
          itemString += ':.' + item.name.replace(/ /g, '-');
        }

        return itemString;
      }
      
      return '';
    },
    
    decodeItem: function(itemStr) {
      var item = {};
      
      if(itemStr != null) {
        angular.forEach(itemStr.split(':'), function(itemBit, bitIndex) {
          if(itemBit.charAt(0) == 'I') {
            item.id = parseInt(itemBit.substr(1), 36);
          }
          else if(itemBit.charAt(0) == 'E') {
            item.enchantmentNum = parseInt(itemBit.substr(1), 36);
          }
          else if(itemBit.charAt(0) == 'P') {
            item.pid = parseInt(itemBit.substr(1), 36);
          }
          else if(itemBit.charAt(0) == 'S') {
            item.setId = parseInt(itemBit.substr(1), 36);
          }
          else if(itemBit.charAt(0) == 'H') {
            item.sparkId = parseInt(itemBit.substr(1), 36);
          }
          else if(itemBit.charAt(0) == 'J') {
            item.baseJobName = itemBit.substr(1);
            item.pve = 'pve';
          }
          else if(itemBit.charAt(0) == '_') {
            item.itemSource = itemBit.substr(1);
          }
          else if(itemBit.charAt(0) == '.') {
            item.name = itemBit.substr(1).replace('-', ' ');
          }
          else if(itemBit.charAt(0) == 'C') {
            item.stats = [];
            var statString = itemBit.substr(1);
            angular.forEach(statString.split('|'), function(statBit, statBitIndex) {
              var splitStat = statBit.split('=');
              item.stats.push({
                id: parseInt(splitStat[0], 36),
                max: Number(splitStat[1])
              });
            });
          }
        });
      }
      
      return item;
    },
    
    createGroupLink: function(groupName, group) {
      var itemStrings = [];
      var self = this;
      angular.forEach(group.items, function(item, key) {
        var itemString = self.encodeItem(item);  
        if(itemString != null && itemString.length > 0) {
          itemStrings.push(itemString);
        }
      });
  
      var retVal = '#/view-group?';
      
      return retVal + '&g=' + encodeURI(groupName) + '&i=' + itemStrings.join(',');
    },

    createShortUrl: function(groupName, group) {
      
      var path = this.createGroupLink(groupName, group);
      var longUrl = window.location.href.split("#")[0] + path;
      var data = { longUrl: longUrl };
      
    	$http.post(
    	  'https://www.googleapis.com/urlshortener/v1/url?key=AIzaSyD5t5o7ZcSAvM-xMwc14ft2BA-MKQA7LMo', data).success(
    	    function(data,status,headers,config){
        		group.shortUrl = data.id;
    	      sessionStorage.setItem(path, data.id);
        	}).
        	error(function(data,status,headers,config){
        		// console.log(data);
        		// console.log(status);
        		// console.log(headers);
        		// console.log(config);
        	});
    },
    
    reloadItem: function(item) {

      if(item == null) {
        // console.log('cannot reload null item');
        return;
      }
      
      // support for old property name
      if('itemTypeName' in item && !item.itemSource) {
        item.itemSource = item.itemTypeName;
      }
      
      if(item.itemSource == 'custom' || item.typeName == 'custom') {
        item.typeName = 'custom';
        return item;
      }
      else if(item.itemSource == 'skills' || item.typeName == 'skills') {
        
        var skillDnt = 'skilltable_character' + item.baseJobName + '.lzjson';
        var skillLevelDnt = 'skillleveltable_character' + item.baseJobName + 'pve' + '.lzjson';
        
        var skillData = dntData.find(skillDnt, 'id', item.id)[0];
        var skillLevelDatas = dntData.getData(skillLevelDnt);
        
        var newItem = {
          id: item.id,
          d: skillData,
          itemSource: item.itemSource,
          typeName: item.itemSource,
          needJobClass: skillData.NeedJob,
          baseJobName: item.baseJobName,
          rank: hCodeValues.rankNames[0],
          enchantmentNum: item.enchantmentNum,
          name: translations.translate(skillData.NameID),
        };
        
        newItem.stats = statHelper.getSkillStats(newItem, skillLevelDatas);
        return newItem;
      }
      else if(item.itemSource in items) {
        
        var itemType = items[item.itemSource];
        var ds = dntData.find(itemType.mainDnt, 'id', item.id);
        if(ds.length == 0) {
          // console.log('item ' + item.id + ' not found?');
        }
        else {
          var d = ds[0];
        
          var totalRatio = 0;
          var p = null;
          if(item.pid > 0) {
            var ps = dntData.find(itemType.potentialDnt, 'id', item.pid);
            if(ps.length > 0) {
              p = ps[0];
              
              if(p.PotentialID != d.TypeParam1) {
                // this happened one time
                // not sure how but it corrupted the stats
                p = null;
              }
              else {
                var potentials = dntData.find(itemType.potentialDnt, 'PotentialID', p.PotentialID);
                angular.forEach(potentials, function(value, key) {
                  totalRatio += value.PotentialRatio;
                });
              }
            }
          }
          
          var newItem = createItem(item.itemSource, d, p, totalRatio);
          initItem(newItem); 

          var usePartDnt = null;
          if(newItem.typeName != 'weapons' && newItem.typeId != 0) {
            usePartDnt = 'partsDnt';
          }
          else {
            usePartDnt = 'weaponDnt';
          }
      
          if(usePartDnt) {
            if(dntData.isLoaded(itemType[usePartDnt]) && dntData.isLoaded(itemType.setDnt)) {
              newItem.setStats = [];
              var parts = dntData.find(itemType[usePartDnt], 'id', item.id);
              if(parts.length > 0) {
                newItem.setId = parts[0].SetItemID;
                var sets = dntData.find(itemType.setDnt, 'id', parts[0].SetItemID);
                if(sets.length > 0) {
                  newItem.setStats = hCodeValues.getStats(sets[0]);
                }
              }
            }
          }

          newItem.fullStats = newItem.stats;
          if(item.enchantmentNum >= 0) {
            newItem.enchantmentNum = item.enchantmentNum;
            
            if(newItem.typeName == 'skills') {
              
            }
            else if(newItem.typeName == 'talisman') {
              var extraStats = [];
              angular.forEach(newItem.stats, function(stat, index) {
                extraStats.push({id: stat.id, max: stat.max * (newItem.enchantmentNum/100)});
              });
              
              newItem.enchantmentStats = extraStats;
              newItem.fullStats = hCodeValues.mergeStats(newItem.enchantmentStats, newItem.stats);
            }
            else {
              var enchantments = dntData.find(itemType.enchantDnt, 'EnchantID', newItem.enchantmentId);
              angular.forEach(enchantments, function(enchantment, index) {
                if(enchantment.EnchantLevel == newItem.enchantmentNum) {
                  newItem.enchantmentStats = hCodeValues.getStats(enchantment);
                  newItem.fullStats = hCodeValues.mergeStats(newItem.enchantmentStats, newItem.stats);
                  return;
                }
              });
            }
          }
          
          if(item.sparkId > 0) {
            newItem.sparkId = item.sparkId;
            var sparks = dntData.find(itemType.sparkDnt, 'id', item.sparkId);
            if(sparks.length > 0) {
              newItem.sparkStats = hCodeValues.getStats(sparks[0]);
              newItem.fullStats = hCodeValues.mergeStats(newItem.fullStats, newItem.sparkStats);
            }
          }
          
          return newItem;
        }
      }
      else {
        // console.log('what is this item source? ' + JSON.stringify(item));
        return {name: 'unknown item source'};
      }
      
      return null;
    },
    
    getDntFiles: function(item) {

      var dntFiles = {};

      if(item == null) {
      }
      else {
        if(!item.itemSource && item.itemTypeName in items) {
          item.itemSource = item.itemTypeName;
        }
        
        if(item.itemSource in items) {
          var itemType = items[item.itemSource];
  
          dntFiles[itemType.mainDnt] = itemColumnsToLoad.mainDnt;
          if('potentialDnt' in itemType) {
            dntFiles[itemType.potentialDnt] = itemColumnsToLoad.potentialDnt;
          }
          
          if('enchantDnt' in itemType) {
            dntFiles[itemType.enchantDnt] = itemColumnsToLoad.enchantDnt;
          }
          
          if('weaponDnt' in itemType) {
            dntFiles[itemType.weaponDnt] = itemColumnsToLoad.weaponDnt;
          }
          
          if('partsDnt' in itemType) {
            dntFiles[itemType.partsDnt] = itemColumnsToLoad.partsDnt;
          }
          
          if('setDnt' in itemType) {
            dntFiles[itemType.setDnt] = itemColumnsToLoad.setDnt;
          }
          
          if('gemDnt' in itemType) {
            dntFiles[itemType.gemDnt] = itemColumnsToLoad.gemDnt;
          }
          
          if('sparkDnt' in itemType) {
            dntFiles[itemType.sparkDnt] = itemColumnsToLoad.sparkDnt;
          }
        }
        else if(item.itemSource == 'skills' || item.typeName == 'skills') {
            var skillDnt = 'skilltable_character' + item.baseJobName + '.lzjson';
            var skillLevelDnt = 'skillleveltable_character' + item.baseJobName + 'pve' + '.lzjson';
            dntFiles[skillLevelDnt] = null;
            dntFiles[skillDnt] = null;
        }
        else if(item.typeName == 'custom') {
        }
        else {
          // console.log('cannot reload item ' + JSON.stringify(item));
        }
      }
      
      return dntFiles;
    }
  }
}]);