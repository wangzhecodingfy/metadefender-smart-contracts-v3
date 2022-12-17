// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.9;

// Libraries
import "./Lib/SafeDecimalMath.sol";

// Inherited
import "./interfaces/IEpochManage.sol";
import "./interfaces/IMetaDefender.sol";
import "./interfaces/ILiquidityCertificate.sol";
import "./interfaces/IPolicy.sol";

// console

/// @title Epoch
/// @notice Contains functions for managing epoch processes and relevant calculations
contract EpochManage is IEpochManage {

    using SafeMath for uint;
    using SafeMath for uint64;
    using SafeDecimalMath for uint;

    uint64 public override currentEpochIndex;
    bool public initialized = false;

    ILiquidityCertificate internal liquidityCertificate;
    IPolicy internal policy;
    IMetaDefender internal metaDefender;
    mapping(uint64 => EpochInfo) internal _epochInfo;

    /**
     * @dev Initialize the contract.
     * @param _metaDefender MetaDefender address.
     * @param _liquidityCertificate LiquidityCertificateProtocol address.
     */
    function init(IMetaDefender _metaDefender, ILiquidityCertificate _liquidityCertificate, IPolicy _policy) external {
        require(!initialized, "already initialized");
        require(address(_metaDefender) != address(0), "liquidityPool cannot be 0 address");
        metaDefender = _metaDefender;
        liquidityCertificate = _liquidityCertificate;
        policy = _policy;
        initialized = true;
    }

    /**
     * @dev update the SPS when settle happens. This helps to calculate how much money one can get when he/she exits in providing liquidity.
                    -------tick1-----tick2-----tick3-----tick4-----tick5-----
                    --------------|------policy with SPS--------|(update here)
                    ---------0-------SPS------ SPS-------SPS-------0---------
     * @param SPS shadow per share.
     * @param enteredEpochIndex the time when the policy is generated.
     */
    function updateCrossShadow(uint SPS, uint64 enteredEpochIndex) external override onlyMetaDefender() {
        uint64 i = 1;
        while (currentEpochIndex - i >= enteredEpochIndex) {
            uint64 previousEpochIndex = currentEpochIndex - i;
            _epochInfo[previousEpochIndex].crossSPS= _epochInfo[previousEpochIndex].crossSPS.add(SPS);
            i++;
        }
    }

    function getEpochInfo(uint64 epochIndex) external view override returns (EpochInfo memory) {
        return _epochInfo[epochIndex];
    }

    function getCurrentEpochInfo() external view override returns(EpochInfo memory) {
        return _epochInfo[currentEpochIndex];
    }

    function getCurrentEpoch() public view override returns (uint) {
        return (block.timestamp.sub(block.timestamp % 1 days)).div(1 days);
    }

    function isExitDay() external view override returns(bool) {
        uint currentEpoch = getCurrentEpoch();
        return currentEpoch % 7 == 0;
    }

    function checkAndCreateNewEpochAndUpdateLiquidity() external override onlyMetaDefender() returns (bool) {
        uint cei = getCurrentEpoch();
        if (cei != _epochInfo[currentEpochIndex].epochId) {
            currentEpochIndex = currentEpochIndex + 1;
            liquidityCertificate.newEpochCreated();
            _epochInfo[currentEpochIndex].epochId = cei;
            _epochInfo[currentEpochIndex].accRPS = _epochInfo[currentEpochIndex - 1].accRPS;
            _epochInfo[currentEpochIndex].accSPS = _epochInfo[currentEpochIndex - 1].accSPS;
            return true;
        }
        return false;
    }

    function checkAndCreateNewEpochAndUpdateAccRPSAccSPS(bool isNewEpoch) external override onlyMetaDefender() {
        IMetaDefender.GlobalInfo memory globalInfo = metaDefender.getGlobalInfo();
        if (isNewEpoch) {
            policy.newEpochCreated();
            _epochInfo[currentEpochIndex].accRPS = globalInfo.accRPS;
            _epochInfo[currentEpochIndex].accSPS = globalInfo.accSPS;
        }
    }

    modifier onlyMetaDefender virtual {
        require(msg.sender == address(metaDefender), "Only MetaDefender");
        _;
    }
}
