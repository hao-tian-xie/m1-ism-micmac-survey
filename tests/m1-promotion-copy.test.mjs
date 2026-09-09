import test from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../translations.mjs';

test('survey prompt uses positive promotion wording in every locale', () => {
  assert.deepEqual(
    {
      question: copy['zh-CN'].topicQuestion,
      selectTargets: copy['zh-CN'].selectTargets,
      directOnly: copy['zh-CN'].directOnly,
      noneOption: copy['zh-CN'].noneOption,
      guideThenTitle: copy['zh-CN'].guideThenTitle,
      guideThenText: copy['zh-CN'].guideThenText,
      guideNextText: copy['zh-CN'].guideNextText,
    },
    {
      question: '哪些主题会因此得到促进？',
      selectTargets: '请选择所有会因此得到促进的主题',
      directOnly: '如果推进一个主题，请选择所有会因此得到促进的主题。',
      noneOption: '没有因此得到促进的主题',
      guideThenTitle: '再看 THEN：选择因此得到促进的主题',
      guideThenText: '勾选所有会因当前主题推进而得到促进的主题，可以多选。',
      guideNextText: '选好后点击“下一主题”。没有得到促进的主题时，选择“没有因此得到促进的主题”。',
    },
  );

  assert.deepEqual(
    {
      question: copy['zh-HK'].topicQuestion,
      selectTargets: copy['zh-HK'].selectTargets,
      directOnly: copy['zh-HK'].directOnly,
      noneOption: copy['zh-HK'].noneOption,
      guideThenTitle: copy['zh-HK'].guideThenTitle,
      guideThenText: copy['zh-HK'].guideThenText,
      guideNextText: copy['zh-HK'].guideNextText,
    },
    {
      question: '哪些主題會因此得到促進？',
      selectTargets: '請選擇所有會因此得到促進的主題',
      directOnly: '如果推動一個主題，請選擇所有會因此得到促進的主題。',
      noneOption: '沒有因此得到促進的主題',
      guideThenTitle: '再看 THEN：選擇因此得到促進的主題',
      guideThenText: '勾選所有會因目前主題推動而得到促進的主題，可以多選。',
      guideNextText: '選好後按「下一主題」。沒有得到促進的主題時，選擇「沒有因此得到促進的主題」。',
    },
  );

  assert.deepEqual(
    {
      question: copy.en.topicQuestion,
      selectTargets: copy.en.selectTargets,
      directOnly: copy.en.directOnly,
      noneOption: copy.en.noneOption,
      guideThenTitle: copy.en.guideThenTitle,
      guideThenText: copy.en.guideThenText,
      guideNextText: copy.en.guideNextText,
    },
    {
      question: 'Which topics will this help advance?',
      selectTargets: 'Select all topics this will help advance.',
      directOnly: 'If one topic is advanced, select all topics it will help advance.',
      noneOption: 'No topics will be advanced as a result.',
      guideThenTitle: 'Read THEN: choose topics this helps advance',
      guideThenText: 'Select every topic the current topic will help advance. You can select more than one.',
      guideNextText: 'Click “Next topic” when you are done. If no topics will be advanced, choose “No topics will be advanced as a result.”',
    },
  );
});
