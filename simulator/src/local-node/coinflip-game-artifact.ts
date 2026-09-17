// The real CoinflipGame, vendored as the foundry-compiled artifact from the
// original games repo (contracts/src/CoinflipGame.sol, solc 0.8.30, optimizer
// + viaIR). Re-vendor after changes there: `forge build`, then copy abi +
// bytecode from contracts/out/CoinflipGame.sol/CoinflipGame.json.
import type { Hex } from 'viem';

export const coinflipGameAbi = [
  {
    type: 'function',
    name: 'onPlayerAction',
    inputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct SessionContext',
        components: [
          {
            name: 'sessionId',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'player',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'vault',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'wagerBase',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'escrowedStake',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'reservedProfit',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'step',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'gameData',
            type: 'bytes',
            internalType: 'bytes',
          },
          {
            name: 'gameState',
            type: 'bytes',
            internalType: 'bytes',
          },
        ],
      },
      {
        name: '',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct StepResult',
        components: [
          {
            name: 'newGameState',
            type: 'bytes',
            internalType: 'bytes',
          },
          {
            name: 'escrowDelta',
            type: 'int256',
            internalType: 'int256',
          },
          {
            name: 'reservedProfitDelta',
            type: 'int256',
            internalType: 'int256',
          },
          {
            name: 'nextPhase',
            type: 'uint8',
            internalType: 'enum SessionPhase',
          },
          {
            name: 'requestRandomnessNow',
            type: 'bool',
            internalType: 'bool',
          },
          {
            name: 'payout',
            type: 'uint256',
            internalType: 'uint256',
          },
        ],
      },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'onRandomness',
    inputs: [
      {
        name: 'ctx',
        type: 'tuple',
        internalType: 'struct SessionContext',
        components: [
          {
            name: 'sessionId',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'player',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'vault',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'wagerBase',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'escrowedStake',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'reservedProfit',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'step',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'gameData',
            type: 'bytes',
            internalType: 'bytes',
          },
          {
            name: 'gameState',
            type: 'bytes',
            internalType: 'bytes',
          },
        ],
      },
      {
        name: 'randomness',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [
      {
        name: 'stepResult',
        type: 'tuple',
        internalType: 'struct StepResult',
        components: [
          {
            name: 'newGameState',
            type: 'bytes',
            internalType: 'bytes',
          },
          {
            name: 'escrowDelta',
            type: 'int256',
            internalType: 'int256',
          },
          {
            name: 'reservedProfitDelta',
            type: 'int256',
            internalType: 'int256',
          },
          {
            name: 'nextPhase',
            type: 'uint8',
            internalType: 'enum SessionPhase',
          },
          {
            name: 'requestRandomnessNow',
            type: 'bool',
            internalType: 'bool',
          },
          {
            name: 'payout',
            type: 'uint256',
            internalType: 'uint256',
          },
        ],
      },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'onSessionStart',
    inputs: [
      {
        name: 'ctx',
        type: 'tuple',
        internalType: 'struct SessionContext',
        components: [
          {
            name: 'sessionId',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'player',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'vault',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'wagerBase',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'escrowedStake',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'reservedProfit',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'step',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'gameData',
            type: 'bytes',
            internalType: 'bytes',
          },
          {
            name: 'gameState',
            type: 'bytes',
            internalType: 'bytes',
          },
        ],
      },
    ],
    outputs: [
      {
        name: 'stepResult',
        type: 'tuple',
        internalType: 'struct StepResult',
        components: [
          {
            name: 'newGameState',
            type: 'bytes',
            internalType: 'bytes',
          },
          {
            name: 'escrowDelta',
            type: 'int256',
            internalType: 'int256',
          },
          {
            name: 'reservedProfitDelta',
            type: 'int256',
            internalType: 'int256',
          },
          {
            name: 'nextPhase',
            type: 'uint8',
            internalType: 'enum SessionPhase',
          },
          {
            name: 'requestRandomnessNow',
            type: 'bool',
            internalType: 'bool',
          },
          {
            name: 'payout',
            type: 'uint256',
            internalType: 'uint256',
          },
        ],
      },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'quoteCaps',
    inputs: [
      {
        name: 'wager',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'gameData',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [
      {
        name: 'maxEscrowStake',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'maxReservedProfit',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'quoteRiskParams',
    inputs: [
      {
        name: 'wager',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'gameData',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [
      {
        name: 'maxPayout',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'probabilityWad',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'expectedPayout',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'subJackpotVarianceScaled',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'error',
    name: 'CoinflipGame__InvalidCoinCount',
    inputs: [
      {
        name: 'coinCount',
        type: 'uint8',
        internalType: 'uint8',
      },
    ],
  },
  {
    type: 'error',
    name: 'CoinflipGame__InvalidGameData',
    inputs: [],
  },
  {
    type: 'error',
    name: 'CoinflipGame__InvalidMinWins',
    inputs: [
      {
        name: 'minWins',
        type: 'uint8',
        internalType: 'uint8',
      },
      {
        name: 'coinCount',
        type: 'uint8',
        internalType: 'uint8',
      },
    ],
  },
  {
    type: 'error',
    name: 'CoinflipGame__InvalidState',
    inputs: [],
  },
  {
    type: 'error',
    name: 'CoinflipGame__NoPlayerAction',
    inputs: [],
  },
] as const;

export const coinflipGameBytecode: Hex =
  '0x60808060405234601557610aa6908161001a8239f35b5f80fdfe60806040526004361015610011575f80fd5b5f3560e01c806332824764146104645780633ae9cd1e146103fa578063610a9d69146102c65780636949b4a8146100c15763f75eb8ce14610050575f80fd5b346100bd5760403660031901126100bd5760043567ffffffffffffffff81116100bd576101209060031990360301126100bd5760243567ffffffffffffffff81116100bd576100a39036906004016104a8565b50506100ad6105f2565b5063ad51bce160e01b5f5260045ffd5b5f80fd5b346100bd5760403660031901126100bd5760043567ffffffffffffffff81116100bd5761012060031982360301126100bd576080906024356101016105f2565b91610113610104820182600401610634565b90809591810103126100bd576040519261012c846105a0565b61013585610667565b845261014360208601610674565b9360208101948552606061015960408801610674565b966040830197885201356060820190808252158015906102be575b6102af5784905260ff855116925f955f5b60ff8116868110156101d35760018881921c16146101a9575b60010160ff16610185565b9660ff600191160160ff81116101bf579661019e565b634e487b7160e01b5f52601160045260245ffd5b50610288858560ff86868e838f865115155f1461029c57915b51169316831161028c5761024e9261025c92606460ff61021094511691013561073f565b925b60405192839160208301919091606080608083019480511515845260ff602082015116602085015260ff60408201511660408501520151910152565b03601f1981018352826105d0565b82525f60208301525f6040830152600360608301525f608083015260a08201526040519182918261050a565b0390f35b50505061024e61025c5f92610212565b6102a99082855116610682565b916101ec565b63bfd2002360e01b5f5260045ffd5b508415610174565b346100bd5760203660031901126100bd5760043567ffffffffffffffff81116100bd57806004019061012060031982360301126100bd576103056105f2565b90610314610104820184610634565b90506102af5761024e6103c3606460ff61033e6103386102889860e4880190610634565b90610696565b91939096013561034f82888361073f565b818111156103f057839161036291610593565b965b60405194610371866105a0565b151585521660208401521660408201525f606082015260405192839160208301919091606080608083019480511515845260ff602082015116602085015260ff60408201511660408501520151910152565b82525f6020830152604082015260016060820152600160808201525f60a08201526040519182918261050a565b5050815f96610364565b346100bd57608061044561041c61044b610413366104d6565b90939193610696565b949150600160ff61ffff61043b61043489868a61073f565b9885610782565b1692161b906107e1565b91610894565b90604051928352602083015260408201525f6060820152f35b346100bd57604061047a610482610413366104d6565b91508361073f565b81808211156104a05761049491610593565b82519182526020820152f35b50505f610494565b9181601f840112156100bd5782359167ffffffffffffffff83116100bd57602083818601950101116100bd57565b9060406003198301126100bd57600435916024359067ffffffffffffffff82116100bd57610506916004016104a8565b9091565b602081526020825160c08284015280519182918260e08601520161010084015e5f610100828401015260208301516040830152604083015160608301526060830151600681101561057f576101009360a09160808501526080810151151582850152015160c0830152601f8019910116010190565b634e487b7160e01b5f52602160045260245ffd5b919082039182116101bf57565b6080810190811067ffffffffffffffff8211176105bc57604052565b634e487b7160e01b5f52604160045260245ffd5b90601f8019910116810190811067ffffffffffffffff8211176105bc57604052565b6040519060c0820182811067ffffffffffffffff8211176105bc576040525f60a083606081528260208201528260408201528260608201528260808201520152565b903590601e19813603018212156100bd570180359067ffffffffffffffff82116100bd576020019181360383136100bd57565b359081151582036100bd57565b359060ff821682036100bd57565b9060ff8091169116039060ff82116101bf57565b9190606081036107305782606091810103126100bd576106b582610667565b906106ce60406106c760208601610674565b9401610674565b9060ff8493941680158015610726575b6107155760ff83168015801561070c575b6106f7575050565b63427d6bdb60e01b5f5260045260245260445ffd5b508181116106ef565b622da71960e21b5f5260045260245ffd5b50600a81116106de565b63131f9af160e31b5f5260045ffd5b9161ffff61074f60ff9284610782565b169116612648811b9060016126488304911b036101bf578161271002916127108304036101bf5761077f92610918565b90565b5f9291905b60ff811660ff83161115610799575050565b909261ffff806107a986856109b6565b1691160161ffff81116101bf579260010160ff1690610787565b81156107cd570490565b634e487b7160e01b5f52601260045260245ffd5b5f19670de0b6b3a7640000820991670de0b6b3a7640000820291828085109403938085039414610888578382111561087057670de0b6b3a7640000829109815f0382168092046002816003021880820260020302808202600203028082026002030280820260020302808202600203028091026002030293600183805f03040190848311900302920304170290565b50634e487b715f52156003026011186020526024601cfd5b509061077f92506107c3565b905f5f19612648840961264884029182808310920391808303921461090d578161271011156108fb57506127106126487fbc01a36e2eb1c432ca57a786c226809d495182a9930be0ded288ce703afb7e9194950990828211900360fc1b910360041c170290565b634e487b71905260116020526024601cfd5b505061271090049150565b90915f1983830992808302928380861095039480860395146109a957848311156109915790829109815f0382168092046002816003021880820260020302808202600203028082026002030280820260020302808202600203028091026002030293600183805f03040190848311900302920304170290565b82634e487b715f52156003026011186020526024601cfd5b50509061077f92506107c3565b91909160ff811660ff841690808211610a68578115908115610a5e575b50610a56576109e28483610682565b9060ff821610610a4e575b50600192835b60ff851660ff83168111610a43578060ff610a0e8587610682565b160160ff81116101bf5760ff16918281029281840414901517156101bf57610a3a60019160ff936107c3565b950116936109f3565b5061ffff1693505050565b92505f6109ed565b506001925050565b905081145f6109d3565b505f9350505056fea264697066735822122032342f18bb5af3b24dc44941dcbf875a126cee5a94d016784b9029b2e965a67b64736f6c634300081e0033';
