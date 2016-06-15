'use strict';

console.log('starting ebs backup : ');
const aws = require('aws-sdk');
const ec2 = new aws.EC2({region: 'ap-northeast-1'});
const co = require('co');

console.log('loaded module : ');

module.exports.handler = (event, context, cb) => {

  co(function *() {
    let instances;
    try {
      // バックアップ対象のインスタンス一覧の取得
      instances = yield ec2.describeInstances(descInstancesParams).promise();
    } catch (err) {
      console.error(err);
      return cb(new Error(err));
    }
    // パース
    let descriptions = parseDescriptions(instances);
    
    console.log('create snapshot');
    let promiseList = [];
    let descriptionValues = [];
    for (let key in descriptions) {
      let description = descriptions[key]
      
      for(let k in description.volumeId) {
        let params = {
          VolumeId: description.volumeId[k],
          Description: description.description + description.volumeId[k],
          DryRun: true
        }
        console.log('volumeId : ' + description.volumeId[k] + '    description : ' + description.description);
        descriptionValues.push(description.description + description.volumeId[k]);
        promiseList.push(ec2.createSnapshot(params).promise());
      }
    }
    try {
      let result = yield promiseList;
      console.log(result);
    } catch(err) {
      // 失敗しても後続処理を行う
      console.log(JSON.stringify(err));
    }
    console.log('get snapshot : ');
    // スナップショットの取得
    let sParams = {
      Filters: [
        {
          Name: 'description',
          Values: descriptionValues
        }
      ]
    }
    let snapShots;
    try {
      snapShots = yield ec2.describeSnapshots(sParams).promise();
    } catch (err) {
      console.error(err);
      return cb(new Error(err));
    }
    let deleteIds = getOldSnapShots(snapShots, descriptions);
    console.log('delete snapshot ids : ' + deleteIds);
    promiseList = [];
    for(let id in deleteIds) {
      let params = {
        SnapshotId: deleteIds[id],
        DryRun: true
      };
      promiseList.push(ec2.deleteSnapshot(params).promise());
    }
    if (promiseList.length < 1) {
      console.log('nothing ');
      return cb(null, 'nothing');
    } 
    try {
      let result = yield promiseList;
      console.log(result);
    } catch(err) {
      console.error(err);
      return cb(new Error(err));
    }
    
    return cb(null, 'ebs backup done');
  });
};

const descInstancesParams = {
    Filters: [
      {
        Name: 'tag-key',
        Values: [
          'Backup-Generation'
        ]
      }
    ],
    DryRun: false
}

function getOldSnapShots(snapshotList, descriptions) {
  console.log('getOldSnapShots : ');
  // description毎にグルーピングを行う
  let group = {};
  snapshotList.Snapshots.forEach(snapShot => {
    let snapshots = {
      generation: 0,
      snapshot: []
    };
    if (group[snapShot.Description]) {
      snapshots = group[snapShot.Description];
    }
    snapshots.snapshot.push(snapShot);
    group[snapShot.Description] = snapshots;
  });
  
  // 世代数を付与
  for (let d in descriptions) {
    for (let v in descriptions[d].volumeId) {
      if (group[descriptions[d].description + descriptions[d].volumeId[v]]) {
        group[descriptions[d].description + descriptions[d].volumeId[v]].generation = descriptions[d].generation;
      }
    }
  }
  
  // 世代数を比較する
  let deleteIds = [];
  for (let key in group) {
    let g = group[key];
    if (g.generation == 0 || g.snapshot.length <= g.generation) continue;
    // if (g.snapshot.length <= 1) continue;
    
    let delete_num = g.snapshot.length - g.generation;
    // let delete_num = g.snapshot.length - 1;
    // 作成日時順にソートする
    g.snapshot.sort((a, b) => {
      if (a.StartTime > b.StartTime) return 1;
      if (a.StartTime < b.StartTime) return -1;
      return 0;
    });
    let i = 0;
    while(i < delete_num) {
      deleteIds.push(g.snapshot[i].SnapshotId);
      i=(i+1)|0;
    }
  }
  return deleteIds;
}

function parseDescriptions(data) {
  console.log('parseDescriptions :');
  let descriptions = {};
  data.Reservations.forEach(reservation => {
    reservation.Instances.forEach(inst => {
      let description = {};
      description.volumeId = [];
      description.id = inst.InstanceId;
      inst.Tags.forEach(tag => {
        if (tag.Key == 'Backup-Generation') {
          description.generation = tag.Value|0;
        } else if (tag.Key == 'Name') {
          description.name = tag.Value;
        }
      });
      // 世代管理しないものは次へ
      if (description.generation < 1) return;
      
      inst.BlockDeviceMappings.forEach(bdm => {
        if (!bdm.Ebs) return;
        description.volumeId.push(bdm.Ebs.VolumeId);
      });
      description.description = 'Auto Snapshot ' + description.name + '  volumeId: ';
      descriptions[description.id] = description;
    });
  });
  return descriptions;
}
