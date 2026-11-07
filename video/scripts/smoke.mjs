// ~20 s pipeline check: intro, simulated sign-in, home, outro.
export default {
  layout: 'desktop',
  steps: [
    { say: '歡迎使用育英公托填表系統。', do: d => d.card('育英公托填表系統', '完整操作教學（電腦版）') },
    { do: d => d.hideCard() },
    {
      chapter: '開始使用',
      say: '第一次打開時，點「使用 Google 登入」，再選自己的帳號。',
      do: async d => {
        await d.click('[data-action="sign-in-google"]');
        await d.click('[data-fake-account]');
      },
    },
    {
      say: '登入之後，資料會自動同步。首頁的「管理幼兒」可以新增幼兒。',
      do: async d => {
        await d.highlight('[data-action="manage-children"]', '管理幼兒');
        await d.wait(1500);
        await d.clearHighlight();
      },
    },
    { say: '感謝收看。', do: d => d.card('感謝收看', '育英公托填表系統') },
  ],
};
