'use strict';
/* Cambridge IELTS 18 — Tests 2, 3, 4
   Listening audio URLs are wired up.
   Question text and transcripts must be filled in from the book PDF.
   Search for "TODO" to find all stubs.
*/

(function () {
  if (typeof TEST_PACKAGES === 'undefined') {
    console.error('data-test.js must be loaded before data-cam18.js');
    return;
  }

  /* ── Test 2 ───────────────────────────────────────────── */
  TEST_PACKAGES['cam18'].tests['test2'] = {
    id: 'test2', name: 'Test 2',
    listening: {
      sections: [
        {
          id: 's1', title: 'Part 1',
          audioUrl: 'Resources/Cam18/Cam18_Audio/IELTS18_test2_audio1.mp3',
          transcript: '', // TODO: add transcript
          questions: [
            { id: 't2l1',  qNum: 1,  type: 'short', text: 'TODO Q1',  answer: '' },
            { id: 't2l2',  qNum: 2,  type: 'short', text: 'TODO Q2',  answer: '' },
            { id: 't2l3',  qNum: 3,  type: 'short', text: 'TODO Q3',  answer: '' },
            { id: 't2l4',  qNum: 4,  type: 'short', text: 'TODO Q4',  answer: '' },
            { id: 't2l5',  qNum: 5,  type: 'short', text: 'TODO Q5',  answer: '' },
            { id: 't2l6',  qNum: 6,  type: 'short', text: 'TODO Q6',  answer: '' },
            { id: 't2l7',  qNum: 7,  type: 'short', text: 'TODO Q7',  answer: '' },
            { id: 't2l8',  qNum: 8,  type: 'short', text: 'TODO Q8',  answer: '' },
            { id: 't2l9',  qNum: 9,  type: 'short', text: 'TODO Q9',  answer: '' },
            { id: 't2l10', qNum: 10, type: 'short', text: 'TODO Q10', answer: '' },
          ]
        },
        {
          id: 's2', title: 'Part 2',
          audioUrl: 'Resources/Cam18/Cam18_Audio/IELTS18_test2_audio2.mp3',
          transcript: '', // TODO: add transcript
          questions: [
            { id: 't2l11', qNum: 11, type: 'short', text: 'TODO Q11', answer: '' },
            { id: 't2l12', qNum: 12, type: 'short', text: 'TODO Q12', answer: '' },
            { id: 't2l13', qNum: 13, type: 'short', text: 'TODO Q13', answer: '' },
            { id: 't2l14', qNum: 14, type: 'short', text: 'TODO Q14', answer: '' },
            { id: 't2l15', qNum: 15, type: 'short', text: 'TODO Q15', answer: '' },
            { id: 't2l16', qNum: 16, type: 'short', text: 'TODO Q16', answer: '' },
            { id: 't2l17', qNum: 17, type: 'short', text: 'TODO Q17', answer: '' },
            { id: 't2l18', qNum: 18, type: 'short', text: 'TODO Q18', answer: '' },
            { id: 't2l19', qNum: 19, type: 'short', text: 'TODO Q19', answer: '' },
            { id: 't2l20', qNum: 20, type: 'short', text: 'TODO Q20', answer: '' },
          ]
        },
        {
          id: 's3', title: 'Part 3',
          audioUrl: 'Resources/Cam18/Cam18_Audio/IELTS18_test2_audio3.mp3',
          transcript: '', // TODO: add transcript
          questions: [
            { id: 't2l21', qNum: 21, type: 'short', text: 'TODO Q21', answer: '' },
            { id: 't2l22', qNum: 22, type: 'short', text: 'TODO Q22', answer: '' },
            { id: 't2l23', qNum: 23, type: 'short', text: 'TODO Q23', answer: '' },
            { id: 't2l24', qNum: 24, type: 'short', text: 'TODO Q24', answer: '' },
            { id: 't2l25', qNum: 25, type: 'short', text: 'TODO Q25', answer: '' },
            { id: 't2l26', qNum: 26, type: 'short', text: 'TODO Q26', answer: '' },
            { id: 't2l27', qNum: 27, type: 'short', text: 'TODO Q27', answer: '' },
            { id: 't2l28', qNum: 28, type: 'short', text: 'TODO Q28', answer: '' },
            { id: 't2l29', qNum: 29, type: 'short', text: 'TODO Q29', answer: '' },
            { id: 't2l30', qNum: 30, type: 'short', text: 'TODO Q30', answer: '' },
          ]
        },
        {
          id: 's4', title: 'Part 4',
          audioUrl: 'Resources/Cam18/Cam18_Audio/IELTS18_test2_audio4.mp3',
          transcript: '', // TODO: add transcript
          questions: [
            { id: 't2l31', qNum: 31, type: 'short', text: 'TODO Q31', answer: '' },
            { id: 't2l32', qNum: 32, type: 'short', text: 'TODO Q32', answer: '' },
            { id: 't2l33', qNum: 33, type: 'short', text: 'TODO Q33', answer: '' },
            { id: 't2l34', qNum: 34, type: 'short', text: 'TODO Q34', answer: '' },
            { id: 't2l35', qNum: 35, type: 'short', text: 'TODO Q35', answer: '' },
            { id: 't2l36', qNum: 36, type: 'short', text: 'TODO Q36', answer: '' },
            { id: 't2l37', qNum: 37, type: 'short', text: 'TODO Q37', answer: '' },
            { id: 't2l38', qNum: 38, type: 'short', text: 'TODO Q38', answer: '' },
            { id: 't2l39', qNum: 39, type: 'short', text: 'TODO Q39', answer: '' },
            { id: 't2l40', qNum: 40, type: 'short', text: 'TODO Q40', answer: '' },
          ]
        },
      ]
    },
    reading:  null, // TODO: add reading passages
    writing:  null, // TODO: add writing tasks
    speaking: null, // TODO: add speaking parts
  };

  /* ── Test 3 ───────────────────────────────────────────── */
  TEST_PACKAGES['cam18'].tests['test3'] = {
    id: 'test3', name: 'Test 3',
    listening: {
      sections: [
        {
          id: 's1', title: 'Part 1',
          audioUrl: 'Resources/Cam18/Cam18_Audio/IELTS18_test3_audio1.mp3',
          transcript: '', // TODO: add transcript
          questions: [
            { id: 't3l1',  qNum: 1,  type: 'short', text: 'TODO Q1',  answer: '' },
            { id: 't3l2',  qNum: 2,  type: 'short', text: 'TODO Q2',  answer: '' },
            { id: 't3l3',  qNum: 3,  type: 'short', text: 'TODO Q3',  answer: '' },
            { id: 't3l4',  qNum: 4,  type: 'short', text: 'TODO Q4',  answer: '' },
            { id: 't3l5',  qNum: 5,  type: 'short', text: 'TODO Q5',  answer: '' },
            { id: 't3l6',  qNum: 6,  type: 'short', text: 'TODO Q6',  answer: '' },
            { id: 't3l7',  qNum: 7,  type: 'short', text: 'TODO Q7',  answer: '' },
            { id: 't3l8',  qNum: 8,  type: 'short', text: 'TODO Q8',  answer: '' },
            { id: 't3l9',  qNum: 9,  type: 'short', text: 'TODO Q9',  answer: '' },
            { id: 't3l10', qNum: 10, type: 'short', text: 'TODO Q10', answer: '' },
          ]
        },
        {
          id: 's2', title: 'Part 2',
          audioUrl: 'Resources/Cam18/Cam18_Audio/IELTS18_test3_audio2.mp3',
          transcript: '', // TODO: add transcript
          questions: [
            { id: 't3l11', qNum: 11, type: 'short', text: 'TODO Q11', answer: '' },
            { id: 't3l12', qNum: 12, type: 'short', text: 'TODO Q12', answer: '' },
            { id: 't3l13', qNum: 13, type: 'short', text: 'TODO Q13', answer: '' },
            { id: 't3l14', qNum: 14, type: 'short', text: 'TODO Q14', answer: '' },
            { id: 't3l15', qNum: 15, type: 'short', text: 'TODO Q15', answer: '' },
            { id: 't3l16', qNum: 16, type: 'short', text: 'TODO Q16', answer: '' },
            { id: 't3l17', qNum: 17, type: 'short', text: 'TODO Q17', answer: '' },
            { id: 't3l18', qNum: 18, type: 'short', text: 'TODO Q18', answer: '' },
            { id: 't3l19', qNum: 19, type: 'short', text: 'TODO Q19', answer: '' },
            { id: 't3l20', qNum: 20, type: 'short', text: 'TODO Q20', answer: '' },
          ]
        },
        {
          id: 's3', title: 'Part 3',
          audioUrl: 'Resources/Cam18/Cam18_Audio/IELTS18_test3_audio3.mp3',
          transcript: '', // TODO: add transcript
          questions: [
            { id: 't3l21', qNum: 21, type: 'short', text: 'TODO Q21', answer: '' },
            { id: 't3l22', qNum: 22, type: 'short', text: 'TODO Q22', answer: '' },
            { id: 't3l23', qNum: 23, type: 'short', text: 'TODO Q23', answer: '' },
            { id: 't3l24', qNum: 24, type: 'short', text: 'TODO Q24', answer: '' },
            { id: 't3l25', qNum: 25, type: 'short', text: 'TODO Q25', answer: '' },
            { id: 't3l26', qNum: 26, type: 'short', text: 'TODO Q26', answer: '' },
            { id: 't3l27', qNum: 27, type: 'short', text: 'TODO Q27', answer: '' },
            { id: 't3l28', qNum: 28, type: 'short', text: 'TODO Q28', answer: '' },
            { id: 't3l29', qNum: 29, type: 'short', text: 'TODO Q29', answer: '' },
            { id: 't3l30', qNum: 30, type: 'short', text: 'TODO Q30', answer: '' },
          ]
        },
        {
          id: 's4', title: 'Part 4',
          audioUrl: 'Resources/Cam18/Cam18_Audio/IELTS18_test3_audio4.mp3',
          transcript: '', // TODO: add transcript
          questions: [
            { id: 't3l31', qNum: 31, type: 'short', text: 'TODO Q31', answer: '' },
            { id: 't3l32', qNum: 32, type: 'short', text: 'TODO Q32', answer: '' },
            { id: 't3l33', qNum: 33, type: 'short', text: 'TODO Q33', answer: '' },
            { id: 't3l34', qNum: 34, type: 'short', text: 'TODO Q34', answer: '' },
            { id: 't3l35', qNum: 35, type: 'short', text: 'TODO Q35', answer: '' },
            { id: 't3l36', qNum: 36, type: 'short', text: 'TODO Q36', answer: '' },
            { id: 't3l37', qNum: 37, type: 'short', text: 'TODO Q37', answer: '' },
            { id: 't3l38', qNum: 38, type: 'short', text: 'TODO Q38', answer: '' },
            { id: 't3l39', qNum: 39, type: 'short', text: 'TODO Q39', answer: '' },
            { id: 't3l40', qNum: 40, type: 'short', text: 'TODO Q40', answer: '' },
          ]
        },
      ]
    },
    reading:  null, // TODO: add reading passages
    writing:  null, // TODO: add writing tasks
    speaking: null, // TODO: add speaking parts
  };

  /* ── Test 4 ───────────────────────────────────────────── */
  TEST_PACKAGES['cam18'].tests['test4'] = {
    id: 'test4', name: 'Test 4',
    listening: {
      sections: [
        {
          id: 's1', title: 'Part 1',
          audioUrl: 'Resources/Cam18/Cam18_Audio/IELTS18_test4_audio1.mp3',
          transcript: '', // TODO: add transcript
          questions: [
            { id: 't4l1',  qNum: 1,  type: 'short', text: 'TODO Q1',  answer: '' },
            { id: 't4l2',  qNum: 2,  type: 'short', text: 'TODO Q2',  answer: '' },
            { id: 't4l3',  qNum: 3,  type: 'short', text: 'TODO Q3',  answer: '' },
            { id: 't4l4',  qNum: 4,  type: 'short', text: 'TODO Q4',  answer: '' },
            { id: 't4l5',  qNum: 5,  type: 'short', text: 'TODO Q5',  answer: '' },
            { id: 't4l6',  qNum: 6,  type: 'short', text: 'TODO Q6',  answer: '' },
            { id: 't4l7',  qNum: 7,  type: 'short', text: 'TODO Q7',  answer: '' },
            { id: 't4l8',  qNum: 8,  type: 'short', text: 'TODO Q8',  answer: '' },
            { id: 't4l9',  qNum: 9,  type: 'short', text: 'TODO Q9',  answer: '' },
            { id: 't4l10', qNum: 10, type: 'short', text: 'TODO Q10', answer: '' },
          ]
        },
        {
          id: 's2', title: 'Part 2',
          audioUrl: 'Resources/Cam18/Cam18_Audio/IELTS18_test4_audio2.mp3',
          transcript: '', // TODO: add transcript
          questions: [
            { id: 't4l11', qNum: 11, type: 'short', text: 'TODO Q11', answer: '' },
            { id: 't4l12', qNum: 12, type: 'short', text: 'TODO Q12', answer: '' },
            { id: 't4l13', qNum: 13, type: 'short', text: 'TODO Q13', answer: '' },
            { id: 't4l14', qNum: 14, type: 'short', text: 'TODO Q14', answer: '' },
            { id: 't4l15', qNum: 15, type: 'short', text: 'TODO Q15', answer: '' },
            { id: 't4l16', qNum: 16, type: 'short', text: 'TODO Q16', answer: '' },
            { id: 't4l17', qNum: 17, type: 'short', text: 'TODO Q17', answer: '' },
            { id: 't4l18', qNum: 18, type: 'short', text: 'TODO Q18', answer: '' },
            { id: 't4l19', qNum: 19, type: 'short', text: 'TODO Q19', answer: '' },
            { id: 't4l20', qNum: 20, type: 'short', text: 'TODO Q20', answer: '' },
          ]
        },
        {
          id: 's3', title: 'Part 3',
          audioUrl: 'Resources/Cam18/Cam18_Audio/IELTS18_test4_audio3.mp3',
          transcript: '', // TODO: add transcript
          questions: [
            { id: 't4l21', qNum: 21, type: 'short', text: 'TODO Q21', answer: '' },
            { id: 't4l22', qNum: 22, type: 'short', text: 'TODO Q22', answer: '' },
            { id: 't4l23', qNum: 23, type: 'short', text: 'TODO Q23', answer: '' },
            { id: 't4l24', qNum: 24, type: 'short', text: 'TODO Q24', answer: '' },
            { id: 't4l25', qNum: 25, type: 'short', text: 'TODO Q25', answer: '' },
            { id: 't4l26', qNum: 26, type: 'short', text: 'TODO Q26', answer: '' },
            { id: 't4l27', qNum: 27, type: 'short', text: 'TODO Q27', answer: '' },
            { id: 't4l28', qNum: 28, type: 'short', text: 'TODO Q28', answer: '' },
            { id: 't4l29', qNum: 29, type: 'short', text: 'TODO Q29', answer: '' },
            { id: 't4l30', qNum: 30, type: 'short', text: 'TODO Q30', answer: '' },
          ]
        },
        {
          id: 's4', title: 'Part 4',
          audioUrl: 'Resources/Cam18/Cam18_Audio/IELTS18_test4_audio4.mp3',
          transcript: '', // TODO: add transcript
          questions: [
            { id: 't4l31', qNum: 31, type: 'short', text: 'TODO Q31', answer: '' },
            { id: 't4l32', qNum: 32, type: 'short', text: 'TODO Q32', answer: '' },
            { id: 't4l33', qNum: 33, type: 'short', text: 'TODO Q33', answer: '' },
            { id: 't4l34', qNum: 34, type: 'short', text: 'TODO Q34', answer: '' },
            { id: 't4l35', qNum: 35, type: 'short', text: 'TODO Q35', answer: '' },
            { id: 't4l36', qNum: 36, type: 'short', text: 'TODO Q36', answer: '' },
            { id: 't4l37', qNum: 37, type: 'short', text: 'TODO Q37', answer: '' },
            { id: 't4l38', qNum: 38, type: 'short', text: 'TODO Q38', answer: '' },
            { id: 't4l39', qNum: 39, type: 'short', text: 'TODO Q39', answer: '' },
            { id: 't4l40', qNum: 40, type: 'short', text: 'TODO Q40', answer: '' },
          ]
        },
      ]
    },
    reading:  null, // TODO: add reading passages
    writing:  null, // TODO: add writing tasks
    speaking: null, // TODO: add speaking parts
  };

  /* ── Stub packages: Cambridge IELTS 14–17 ────────────────
     These packages have no data yet. Add audio files and
     question data following the same pattern as cam18.
  ── */
  function _makeStubPackage(id, name) {
    const tests = {};
    for (let t = 1; t <= 4; t++) {
      tests['test' + t] = {
        id: 'test' + t, name: 'Test ' + t,
        listening: null, reading: null, writing: null, speaking: null,
      };
    }
    return { id, name, tests };
  }

  TEST_PACKAGES['cam17'] = _makeStubPackage('cam17', 'Cambridge IELTS 17');
  TEST_PACKAGES['cam16'] = _makeStubPackage('cam16', 'Cambridge IELTS 16');
  TEST_PACKAGES['cam15'] = _makeStubPackage('cam15', 'Cambridge IELTS 15');
  TEST_PACKAGES['cam14'] = _makeStubPackage('cam14', 'Cambridge IELTS 14');

  console.log('[Learn With Trang] Loaded Cambridge IELTS 18 Tests 2–4 + stubs for Cam14–17');
})();
