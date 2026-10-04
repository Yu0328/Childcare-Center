// Static text for the 操作說明 screen (src/ui/helpView.js). Every button named here is drawn as a
// chip that looks like the real button; chip labels must match what the app actually shows.
// Example names only (王小明) — never a real child's.

const chip = (label, variant) => `<span class="help-chip${variant ? ` help-chip--${variant}` : ''}">${label}</span>`;
const sectionTitle = ({ id, title }) => `<h3 class="help-section-title" id="help-section-${id}">${title}</h3>`;
const WEB_ONLY = '<p class="help-webonly">此功能僅網頁版提供</p>';

const START_SECTIONS = [
  { id: 'home', title: '首頁有什麼' },
  { id: 'install', title: '加到主畫面' },
];

const PARENT_REPORT_SECTIONS = [
  { id: 'create', title: '建立一份適性紀錄' },
  { id: 'course-plan', title: '課程計畫表' },
  { id: 'copy-plan', title: '套用其他幼兒課程計畫' },
  { id: 'records', title: '適性發展紀錄、行為觀察' },
  { id: 'highlights', title: '點滴分享' },
  { id: 'export', title: '匯出 Word' },
];

const ASSESSMENT_SECTIONS = [
  { id: 'assessment-create', title: '建立一份總表' },
  { id: 'assessment-fill', title: '填寫觀察紀錄' },
  { id: 'aggregate', title: '從適性紀錄彙整' },
  { id: 'assessment-export', title: '匯出 Word' },
];

const BACKUP_SECTIONS = [
  { id: 'backup-export', title: '匯出備份' },
  { id: 'backup-import', title: '匯入備份' },
  { id: 'google-sync', title: 'Google 帳號同步' },
];

const [home, install] = START_SECTIONS;
const [prCreate, prCoursePlan, prCopy, prRecords, prHighlights, prExport] = PARENT_REPORT_SECTIONS;
const [asCreate, asFill, asAggregate, asExport] = ASSESSMENT_SECTIONS;
const [bkExport, bkImport, bkSync] = BACKUP_SECTIONS;

export const HELP_CHAPTERS = [
  {
    id: 'start',
    title: '開始使用',
    sections: START_SECTIONS,
    html: `
      <p class="help-intro">這個系統把「適性總表」、「適性紀錄(家長版)」、「課程月計畫」三種表單搬到電腦和手機上填寫，填好後可以直接匯出成 Word 檔，不用再一份一份重新打字。</p>
      ${sectionTitle(home)}
      <div class="help-diagram" aria-hidden="true">
        <div class="help-diagram__row">
          <div class="help-diagram__box">管理幼兒</div>
          <div class="help-diagram__box">匯入檔案</div>
        </div>
        <div class="help-diagram__box">適性總表</div>
        <div class="help-diagram__box">適性紀錄(家長版)</div>
        <div class="help-diagram__box">課程月計畫</div>
        <div class="help-diagram__box help-diagram__box--hl">操作說明</div>
        <div class="help-diagram__caption">首頁</div>
      </div>
      <ul>
        <li>${chip('管理幼兒', 'rose')}：新增或刪除幼兒。</li>
        <li>${chip('匯入檔案', 'rose')}：把以前用 Word 填好的表單匯進來。</li>
        <li>${chip('適性總表', 'brand')}、${chip('適性紀錄(家長版)', 'purple')}、${chip('課程月計畫', 'green')}：進入各表單開始填寫。</li>
      </ul>
      <div class="help-tip">在任何畫面按最上方的系統名稱「屏東縣內埔鄉育英公托填表系統」，都能回到首頁。</div>
      <div class="help-tip">打完字一定要按 ${chip('新增', 'primary')} 或 ${chip('儲存', 'primary')}。沒按就離開畫面，剛剛打的字不會留下來，系統也不會提醒。</div>
      <div class="help-tip">用手機時，新增用的表單會先收起來，按畫面右下角藍色圓形的 ${chip('＋', 'primary')} 才會打開。這顆按鈕可以按住拖到別的位置。</div>

      ${sectionTitle(install)}
      ${WEB_ONLY}
      <p>把系統加到主畫面後，就能像一般 App 一樣，從圖示直接打開，沒有網路時也能使用。</p>
      <p><strong>iPhone／iPad（Safari）</strong></p>
      <ol class="help-steps">
        <li>用 Safari 打開系統網址。</li>
        <li>按畫面下方的「分享」按鈕（方框加一個向上的箭頭）。</li>
        <li>往下找到「加入主畫面」，再按右上角的「新增」。</li>
      </ol>
      <p><strong>Android 手機（Chrome）</strong></p>
      <ol class="help-steps">
        <li>用 Chrome 打開系統網址。</li>
        <li>按右上角的「⋮」。</li>
        <li>選「加到主畫面」或「安裝應用程式」，再按「安裝」。</li>
      </ol>
      <p><strong>電腦（Chrome 或 Edge）</strong></p>
      <ol class="help-steps">
        <li>用 Chrome 或 Edge 打開系統網址。</li>
        <li>按網址列最右邊的「安裝」小圖示（一個螢幕加向下箭頭）。找不到的話，打開右上角的選單（「⋮」或「…」），找有「安裝」字樣的項目。</li>
        <li>按「安裝」。之後桌面和開始功能表就會有系統的圖示。</li>
      </ol>
      <div class="help-tip">如果你用的是單一檔案版本（檔名是 TableC.html），把檔案放在桌面，要用時直接按兩下打開就好。</div>
    `,
  },
  {
    id: 'children',
    title: '管理幼兒',
    html: `
      <p class="help-intro">每份表單都屬於某一位幼兒，所以要先把幼兒加進系統。從 Word 匯入時，系統也會自動幫你新增還沒有的幼兒。</p>
      <p><strong>新增幼兒</strong></p>
      <ol class="help-steps">
        <li>在首頁按 ${chip('管理幼兒', 'rose')}。</li>
        <li>在「新增幼兒」表單填「姓名」，再用三個選單選「出生日期」（年份是民國年）。手機上要先按右下角的 ${chip('＋', 'primary')}。</li>
        <li>按 ${chip('新增', 'primary')}。幼兒會出現在列表中，旁邊會顯示出生日期和目前幾個月大。</li>
      </ol>
      <p><strong>刪除幼兒</strong></p>
      <ol class="help-steps">
        <li>在幼兒列表中，按那位幼兒右邊的 ${chip('×', 'danger')}。</li>
        <li>確認視窗出現後按「確定」。</li>
      </ol>
      <div class="help-tip">刪除幼兒會連同他的適性總表、適性紀錄和月計畫上的標記一起刪掉，而且無法復原。</div>
      <div class="help-tip">目前不能修改姓名或出生日期。如果打錯了，請刪除這位幼兒再重新新增，最好在還沒開始填表單之前就處理。</div>
    `,
  },
  {
    id: 'import',
    title: '匯入舊的 Word 檔',
    html: `
      <p class="help-intro">以前用 Word 填好的適性總表、適性紀錄或課程月計畫，可以直接匯進系統，不用重新打字。系統會自己判斷是哪一種表單。</p>
      <ol class="help-steps">
        <li>在首頁按 ${chip('匯入檔案', 'rose')}，選一個或多個 .docx 檔。</li>
        <li>每個檔案都會出現一個「確認匯入內容」畫面。請檢查姓名、出生日期、月齡階段和紀錄年月是否正確。</li>
        <li>不想匯入的項目，把前面的勾勾取消。</li>
        <li>按最下方的 ${chip('確認匯入', 'primary')}。如果這個檔案不要匯入，就按左上角的 ${chip('← 取消匯入', 'brand')}。</li>
        <li>選了好幾個檔案時，下一個檔案的確認畫面會自動接著出現。</li>
      </ol>
      <p>匯入課程月計畫時，每位小朋友多了兩個要選的地方：</p>
      <ul>
        <li>「比對小朋友」：選系統裡已經有的幼兒，或選「建立新小朋友」再填姓名和出生日期。</li>
        <li>「月齡階段」：每位小朋友都要選。</li>
      </ul>
      <div class="help-tip">姓名和出生日期都一樣的幼兒，資料會自動接到同一位幼兒底下，不會重複新增。</div>
      <div class="help-tip">匯入的資料旁邊會有一個「新」字，打開看過之後就會消失。</div>
      <div class="help-tip">如果出現「舊版 .doc 檔」的訊息，請先用 Word 打開那個檔案，選「另存新檔」存成 .docx，再重新匯入。</div>
      <p>幼兒列表和課程月計畫列表上方也有 ${chip('適性總表匯入', 'purple')}、${chip('適性紀錄匯入', 'purple')}、${chip('課程月計畫匯入', 'purple')} 按鈕，用法完全一樣。</p>
    `,
  },
  {
    id: 'monthly-plan',
    title: '課程月計畫',
    html: `
      <p class="help-intro">課程月計畫是整個班級一個月的活動安排。同一個年齡層的幼兒共用同一份活動，每位幼兒再個別標記請假或未達成。</p>
      <p><strong>建立月計畫</strong></p>
      <ol class="help-steps">
        <li>在首頁按 ${chip('課程月計畫', 'green')}。</li>
        <li>在「新增課程月計畫」表單選「年月」，勾選這個月要排課的幼兒。</li>
        <li>按 ${chip('新增', 'primary')}。系統會直接打開這份計畫，並先填好預設活動。</li>
      </ol>
      <p><strong>安排每天的活動</strong></p>
      <ol class="help-steps">
        <li>班上有兩位以上幼兒時，上方會有一排名字，按名字切換要看哪一位的行事曆。</li>
        <li>行事曆每週一區、每天一格。電腦上按一下日期格子，那天的內容就會出現在旁邊；手機上要在格子上連按兩下。</li>
        <li>要新增活動時，先選「指標所屬年齡層」和「指標」（也可以選「不選指標，純活動」），確認「活動名稱」和「指標內容」後，按 ${chip('新增項目', 'primary')}。</li>
        <li>已有的活動可以按 ${chip('編輯', 'purple')} 修改，或按 ${chip('×', 'danger')} 刪除。</li>
      </ol>
      <p><strong>標記個別幼兒</strong></p>
      <p>每個活動底下有兩個勾選框，只會套用在目前選的那位幼兒身上，勾了就會自動存起來：</p>
      <ul>
        <li>「未達成」</li>
        <li>「請假／其他活動代替」：勾了之後，可以在旁邊的框框寫替代的活動內容；沒寫的話會顯示「請假」。</li>
      </ul>
      <div class="help-tip">活動是同年齡層幼兒共用的。刪除一個活動，同階段所有幼兒的這個活動都會一起刪掉。</div>
      <p><strong>其他</strong></p>
      <ul>
        <li>${chip('管理幼兒', 'purple')}：修改這份計畫包含哪些幼兒。</li>
        <li>${chip('匯出 Word', 'purple')}：下載這份月計畫的 Word 檔，檔名像「115年10月課程月計畫.docx」。</li>
      </ul>
    `,
  },
  {
    id: 'parent-report',
    title: '適性紀錄（家長版）',
    sections: PARENT_REPORT_SECTIONS,
    html: `
      <p class="help-intro">適性紀錄是每個月給家長看的報告，每位幼兒每個月一份，裡面有四個部分，用上方的分頁切換。</p>
      <div class="help-diagram" aria-hidden="true">
        <div class="help-diagram__row">
          <div class="help-diagram__box">← 返回</div>
          <div class="help-diagram__box help-diagram__box--hl">套用</div>
          <div class="help-diagram__box help-diagram__box--hl">匯出 Word</div>
        </div>
        <div class="help-diagram__row">
          <div class="help-diagram__box help-diagram__box--hl">課程計畫表</div>
          <div class="help-diagram__box">適性發展紀錄表</div>
          <div class="help-diagram__box">行為觀察</div>
          <div class="help-diagram__box">點滴分享</div>
        </div>
        <div class="help-diagram__caption">適性紀錄的上方：按鈕和四個分頁</div>
      </div>

      ${sectionTitle(prCreate)}
      <ol class="help-steps">
        <li>在首頁按 ${chip('適性紀錄(家長版)', 'purple')}，再按要填寫的幼兒。</li>
        <li>在「新增適性紀錄」表單確認「月齡階段」（系統會依幼兒年齡自動選好）和「紀錄年月」。</li>
        <li>按 ${chip('新增', 'primary')}，再按列表中的這一份打開。</li>
      </ol>

      ${sectionTitle(prCoursePlan)}
      <ol class="help-steps">
        <li>在「新增課程計畫項目」表單選「指標」，「活動名稱」和「能力指標內容」會自動帶入，可以再修改。</li>
        <li>如果要記錄較早年齡層的指標，先切換上方的「指標所屬年齡層」再選指標。</li>
        <li>可以順便填第一次上課的「日期」、選 ○已發展 或 △發展中，並寫「說明內容」。日期留白就只新增項目。</li>
        <li>按 ${chip('新增', 'primary')}。</li>
        <li>之後每次上這堂課，就在項目下方按 ${chip('＋ 新增實施紀錄')}，填日期、狀態和說明，按 ${chip('儲存', 'primary')}。</li>
      </ol>
      <div class="help-tip">那天沒上到課，就勾「請假／未執行」；換成別的活動，就勾「更換課程」並在說明寫換成了什麼。兩個只能勾一個，勾了就不用選 ○／△，匯出時日期和說明會被劃掉。</div>
      <div class="help-tip">項目依領域分組，按領域的標題可以展開或收起。按項目上的 ${chip('編輯', 'purple')} 修改、按 ${chip('×', 'danger')} 刪除。</div>

      ${sectionTitle(prCopy)}
      <p>同一個月、同一個年齡層的幼兒，課程通常差不多。可以把另一位幼兒已經填好的課程計畫整份複製過來，再逐筆修改。</p>
      <ol class="help-steps">
        <li>在「課程計畫表」分頁，按上方的 ${chip('套用其他幼兒課程計畫', 'purple')}（手機上是 ${chip('套用', 'purple')}）。</li>
        <li>選要複製哪一位幼兒的課程計畫，名字後面會顯示有幾筆。</li>
        <li>按 ${chip('套用', 'primary')}，看完確認視窗的說明後按「確定」。</li>
      </ol>
      <div class="help-tip">套用會把這份原本的課程計畫整份換掉。日期和說明會照抄過來，狀態一律先填 ○，請假和更換課程不會複製，請再逐筆確認。</div>

      ${sectionTitle(prRecords)}
      <p><strong>適性發展紀錄表</strong>：寫給家長看的發展敘述，一個領域一段。</p>
      <ol class="help-steps">
        <li>切到「適性發展紀錄表」分頁，在「新增段落」選「領域」。</li>
        <li>下方會列出這個領域已在課程計畫表填過的項目，勾選這段要提到的項目。</li>
        <li>寫「敘述」，按 ${chip('新增', 'primary')}。</li>
      </ol>
      <p><strong>行為觀察</strong>：切到「行為觀察」分頁，填「標題」（可以不填）和「敘述」，按 ${chip('新增', 'primary')}。</p>

      ${sectionTitle(prHighlights)}
      <ol class="help-steps">
        <li>切到「點滴分享」分頁，按「照片 1」～「照片 3」的框框選照片，一次可以選好幾張。電腦上也可以直接把照片拖進框框。</li>
        <li>寫「描述」，按 ${chip('新增', 'primary')}。</li>
      </ol>
      <div class="help-tip">每則最多 3 張照片。存好之後只能刪掉照片，不能再補照片；要換照片的話，請刪掉整則重新新增。</div>

      ${sectionTitle(prExport)}
      <ol class="help-steps">
        <li>在任何一個分頁按 ${chip('匯出 Word', 'purple')}。</li>
        <li>如果內容寫到「今天」或「今日」，會先跳出一個視窗，把這些句子列出來讓你修改（例如改成實際日期）。改好後按 ${chip('儲存並匯出', 'primary')}；只想先存起來就按 ${chip('只儲存')}。</li>
        <li>Word 檔會下載到電腦或手機的「下載」資料夾，檔名像「王小明-適性紀錄-115年10月.docx」。</li>
      </ol>
    `,
  },
  {
    id: 'assessment',
    title: '適性總表',
    sections: ASSESSMENT_SECTIONS,
    html: `
      <p class="help-intro">適性總表是依年齡層整理的發展觀察紀錄，每個指標底下記錄每次觀察的日期和狀況。可以自己填，也可以直接把每個月的適性紀錄彙整進來。</p>

      ${sectionTitle(asCreate)}
      <ol class="help-steps">
        <li>在首頁按 ${chip('適性總表', 'brand')}，再按要填寫的幼兒。</li>
        <li>在「新增適性總表」表單確認「月齡階段」和「紀錄年月」。月齡階段會依幼兒今天的年齡自動選好；補登以前的資料時，可以自己改成當時的階段。</li>
        <li>紀錄跨好幾個月時，勾「涵蓋一段期間（跨多個月份）」，再選結束的年月。</li>
        <li>按 ${chip('新增', 'primary')}，再按列表中的這一份打開。</li>
      </ol>

      ${sectionTitle(asFill)}
      <ol class="help-steps">
        <li>電腦上，按上方的領域分頁切換；手機上，按領域的標題展開。</li>
        <li>在要記錄的指標下方按 ${chip('＋ 新增觀察紀錄')}。</li>
        <li>填「日期」，選 ○已發展、△發展中、請假 或 更換課程，再寫觀察敘述。</li>
        <li>按 ${chip('儲存', 'primary')}。</li>
      </ol>
      <div class="help-tip">最後的「備註」會自動列出上一個階段還在「發展中」的項目。也可以按 ${chip('＋ 新增備註')} 自己加。</div>

      ${sectionTitle(asAggregate)}
      <p>把好幾個月的適性紀錄（課程計畫表）合併成一份總表，不用再一筆一筆抄。</p>
      <ol class="help-steps">
        <li>在幼兒的適性總表列表，按上方的 ${chip('從適性紀錄彙整', 'purple')}。</li>
        <li>選「月齡階段」，再勾要彙整哪幾個月的適性紀錄。</li>
        <li>「彙整方式」選「建立新總表」，或選「合併進現有總表」並選要合併進哪一份。</li>
        <li>按 ${chip('建立總表', 'primary')} 或 ${chip('合併進總表', 'primary')}。</li>
        <li>如果有需要你確認的內容（例如其他年齡層的指標會放進備註、重複的資料會跳過），會先列出來，看完按 ${chip('確認彙整', 'primary')}。</li>
      </ol>
      <div class="help-tip">已經彙整過的資料會自動跳過，不會重複。所以每個月填完適性紀錄後，都可以再「合併進現有總表」一次。請假和更換課程也會一起帶過去。</div>

      ${sectionTitle(asExport)}
      <p>在總表裡按 ${chip('匯出 Word', 'purple')}，檔案會下載到「下載」資料夾，檔名像「王小明-C表-115年10月.docx」。</p>
    `,
  },
  {
    id: 'backup',
    title: '資料保存',
    sections: BACKUP_SECTIONS,
    html: `
      <p class="help-intro">所有資料都存在這台電腦或手機的瀏覽器裡。換電腦、清除瀏覽器資料或重灌之前，一定要先匯出備份，不然資料會不見。</p>

      ${sectionTitle(bkExport)}
      <ol class="help-steps">
        <li>按畫面最上方的 ${chip('備份', 'brand')}，再按 ${chip('匯出備份', 'brand')}。</li>
        <li>等進度條跑完，會下載一個像「2026-10-04_備份.json」的檔案。</li>
      </ol>
      <div class="help-tip">建議每週或每個月固定備份一次，把檔案存在隨身碟或自己的電腦裡。</div>
      <div class="help-tip">備份檔裡有所有幼兒的姓名、出生日期和照片，而且沒有加密。請不要放在共用的雲端資料夾，也不要傳給別人。</div>

      ${sectionTitle(bkImport)}
      <ol class="help-steps">
        <li>按 ${chip('備份', 'brand')}，再按 ${chip('匯入備份', 'brand')}，選之前存的 .json 備份檔。</li>
        <li>確認視窗出現後按「確定」。匯入完成後，頁面會自動重新整理。</li>
      </ol>
      <div class="help-tip">匯入備份會先清除這台裝置上目前所有的資料，再換成備份檔的內容，不會合併。如果這台裝置有還沒備份的新資料，請先匯出備份。</div>

      ${sectionTitle(bkSync)}
      ${WEB_ONLY}
      <p>登入 Google 帳號後，資料會自動在你的電腦和手機之間同步，不用再手動匯出匯入。</p>
      <ol class="help-steps">
        <li>打開系統時，選「使用 Google 登入」並登入帳號。選「以訪客身份繼續」的話，資料只會存在這台裝置。</li>
        <li>之後每次存檔，系統都會自動同步，你的 Google 雲端硬碟裡會多一個「育英公托填表系統」資料夾。</li>
        <li>畫面上方會顯示「上次同步」的時間。想馬上同步，可以按 ${chip('立即同步', 'brand')}。</li>
      </ol>
      <div class="help-tip">如果同一筆資料在兩台裝置上都改過，系統會請你選「保留這台裝置的」、「保留雲端的」或「都保留」，每筆都選好後按 ${chip('完成', 'primary')}。</div>
      <div class="help-tip">按 ${chip('登出', 'brand')} 只會停止同步，這台裝置上的資料不會被刪除。</div>
    `,
  },
  {
    id: 'faq',
    title: '常見問題',
    html: `
      <dl class="help-faq">
        <dt>資料怎麼不見了？</dt>
        <dd>資料只存在「同一台裝置的同一個瀏覽器」裡。換了瀏覽器、用了無痕視窗，或清除過瀏覽器資料，就會看不到。可以用之前的備份檔「匯入備份」救回來。</dd>
        <dt>匯出的 Word 檔在哪裡？</dt>
        <dd>在瀏覽器的「下載」資料夾。電腦通常是「本機 → 下載」；手機可以在「檔案」App 裡的「下載」找到。</dd>
        <dt>手機和電腦的資料會自動同步嗎？</dt>
        <dd>網頁版登入 Google 帳號才會自動同步。沒有登入的話，兩邊的資料是分開的。要搬資料，可以在一邊「匯出備份」，到另一邊「匯入備份」，但另一邊原本的資料會被取代。</dd>
        <dt>幼兒的名字或生日打錯了，怎麼改？</dt>
        <dd>目前不能直接修改，請刪除這位幼兒再重新新增。刪除會連他的表單一起刪掉，所以最好在剛新增時就檢查清楚。</dd>
        <dt>列表上的「新」是什麼意思？</dt>
        <dd>代表這份資料是從 Word 匯入的，你還沒打開看過。打開之後就會消失。</dd>
        <dt>剛剛打的字怎麼不見了？</dt>
        <dd>還沒按「新增」或「儲存」就離開畫面或切換分頁，打的字不會保留。請記得先存好再離開。</dd>
        <dt>手機上找不到新增的表單？</dt>
        <dd>手機上表單會先收起來，按畫面右下角藍色圓形的「＋」就會打開。</dd>
        <dt>畫面上出現「有新版本」？</dt>
        <dd>代表系統有更新。先把正在填的內容存好，再按「更新」。</dd>
      </dl>
    `,
  },
];
